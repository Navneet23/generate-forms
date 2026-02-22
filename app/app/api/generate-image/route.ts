import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { put } from "@vercel/blob";
import { nanoid } from "nanoid";
import fs from "fs";
import path from "path";

const IMAGE_MODEL_ID = "gemini-2.0-flash-exp";
const LOG_FILE = path.join(process.cwd(), "debug.log");

function log(...args: unknown[]) {
  const line = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a, null, 2))).join(" ");
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + "\n");
}

interface GenerateImageRequest {
  prompt: string;
  imageType: "background" | "header" | "accent";
  colorPalette: string;
  aspectRatio: string;
}

export async function POST(req: NextRequest) {
  try {
    const { prompt, imageType, colorPalette, aspectRatio }: GenerateImageRequest =
      await req.json();

    if (!prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

    // Build the image generation prompt with context
    const fullPrompt = [
      prompt,
      colorPalette ? `Use these dominant colors: ${colorPalette}.` : "",
      aspectRatio ? `Aspect ratio: ${aspectRatio}.` : "",
      imageType === "background"
        ? "This image will be used as a form background. Keep it subtle with low contrast so text remains readable over it."
        : "",
      imageType === "header"
        ? "This image will be used as a header/banner at the top of a form. Make it visually striking."
        : "",
      "Do not include any text, words, letters, or numbers in the image.",
    ]
      .filter(Boolean)
      .join(" ");

    log("\n=== [IMAGE-GEN] REQUEST ===");
    log(`[IMAGE-GEN] Model: ${IMAGE_MODEL_ID}`);
    log(`[IMAGE-GEN] Image type: ${imageType}`);
    log(`[IMAGE-GEN] Color palette: ${colorPalette}`);
    log(`[IMAGE-GEN] Aspect ratio: ${aspectRatio}`);
    log(`[IMAGE-GEN] Original prompt from Gemini: ${prompt}`);
    log(`[IMAGE-GEN] Full prompt sent to Nano Banana:`);
    log(fullPrompt);
    log("=== [IMAGE-GEN] END REQUEST ===\n");

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: IMAGE_MODEL_ID,
      generationConfig: {
        // @ts-expect-error - responseModalities is supported but not typed yet
        responseModalities: ["image", "text"],
      },
    });

    log("[IMAGE-GEN] >>> Calling Nano Banana...");
    const result = await model.generateContent(fullPrompt);
    const response = result.response;
    const parts = response.candidates?.[0]?.content?.parts;

    if (!parts) {
      throw new Error("No response from image generation model");
    }

    // Find the image part in the response
    const imagePart = parts.find(
      (p: { inlineData?: { mimeType: string; data: string } }) =>
        p.inlineData?.mimeType?.startsWith("image/")
    );

    if (!imagePart?.inlineData) {
      throw new Error("No image generated — model returned text only");
    }

    const { mimeType, data: base64Data } = imagePart.inlineData;
    const extension = mimeType === "image/png" ? "png" : "jpeg";

    // Upload to Vercel Blob
    const buffer = Buffer.from(base64Data, "base64");
    const filename = `form-${imageType}-${nanoid(8)}.${extension}`;

    log(`[IMAGE-GEN] <<< Image received from Nano Banana`);
    log(`[IMAGE-GEN]     MIME type: ${mimeType}`);
    log(`[IMAGE-GEN]     Base64 length: ${base64Data.length} chars`);
    log(`[IMAGE-GEN]     Buffer size: ${buffer.length} bytes`);
    log(`[IMAGE-GEN] >>> Uploading to Vercel Blob as: ${filename}`);

    const blob = await put(filename, buffer, {
      access: "public",
      contentType: mimeType,
    });

    log(`[IMAGE-GEN] <<< Uploaded to Vercel Blob`);
    log(`[IMAGE-GEN]     CDN URL: ${blob.url}`);
    log("=== [IMAGE-GEN] DONE ===\n");

    return NextResponse.json({
      url: blob.url,
      imageType,
      base64: base64Data,
      mimeType,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Image generation failed";
    log("[IMAGE-GEN] ERROR:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
