import { GoogleGenerativeAI } from "@google/generative-ai";
import { put } from "@vercel/blob";
import { nanoid } from "nanoid";
import { GeneratedImage } from "./gemini";

const IMAGE_MODEL_ID = "gemini-2.5-flash-image";

export async function generateImage(params: {
  prompt: string;
  imageType: "background" | "header" | "accent";
  colorPalette: string;
  aspectRatio: string;
}): Promise<GeneratedImage> {
  const { prompt, imageType, colorPalette, aspectRatio } = params;

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

  console.log(`[IMAGE-GEN] Model: ${IMAGE_MODEL_ID}, type: ${imageType}`);
  console.log(`[IMAGE-GEN] Prompt: ${prompt}`);

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: IMAGE_MODEL_ID,
    generationConfig: {
      // @ts-expect-error - responseModalities is supported but not typed yet
      responseModalities: ["TEXT", "IMAGE"],
    },
  });

  const result = await model.generateContent(fullPrompt);
  const response = result.response;
  const parts = response.candidates?.[0]?.content?.parts;

  if (!parts) {
    throw new Error("No response from image generation model");
  }

  const imagePart = parts.find(
    (p: { inlineData?: { mimeType: string; data: string } }) =>
      p.inlineData?.mimeType?.startsWith("image/")
  );

  if (!imagePart?.inlineData) {
    throw new Error("No image generated — model returned text only");
  }

  const { mimeType, data: base64Data } = imagePart.inlineData;
  const extension = mimeType === "image/png" ? "png" : "jpeg";

  const buffer = Buffer.from(base64Data, "base64");
  const filename = `form-${imageType}-${nanoid(8)}.${extension}`;

  console.log(`[IMAGE-GEN] Image received: ${mimeType}, ${buffer.length} bytes`);
  console.log(`[IMAGE-GEN] Uploading to Vercel Blob as: ${filename}`);

  const blob = await put(filename, buffer, {
    access: "public",
    contentType: mimeType,
  });

  console.log(`[IMAGE-GEN] Uploaded: ${blob.url}`);

  return {
    url: blob.url,
    imageType,
    base64: base64Data,
    mimeType,
  };
}
