import { GoogleGenAI } from "@google/genai";
import { put } from "@vercel/blob";
import { nanoid } from "nanoid";
import { GeneratedImage } from "./gemini";

export type ImageModelId = "gemini-2.5-flash-image" | "gemini-3.1-flash-image-preview";

export class ImageGenError extends Error {
  code: number | null;
  constructor(message: string, code: number | null = null) {
    super(message);
    this.name = "ImageGenError";
    this.code = code;
  }

  static fromError(err: unknown): ImageGenError {
    if (err instanceof ImageGenError) return err;
    const message = err instanceof Error ? err.message : String(err);
    // Parse Gemini SDK errors like "[429 Too Many Requests] ..."
    const match = message.match(/\[(\d{3})\s+([^\]]+)\]/);
    if (match) {
      const code = parseInt(match[1]);
      return new ImageGenError(`${match[2]}: ${message.replace(/.*\[\d{3}\s+[^\]]+\]\s*/, "")}`, code);
    }
    return new ImageGenError(message);
  }
}

export async function generateImage(params: {
  prompt: string;
  imageType: "background" | "header" | "accent";
  colorPalette: string;
  aspectRatio: string;
  modelId: ImageModelId;
}): Promise<GeneratedImage> {
  const { prompt, imageType, colorPalette, aspectRatio, modelId } = params;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

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

  console.log(`[IMAGE-GEN] Model: ${modelId}, type: ${imageType}`);
  console.log(`[IMAGE-GEN] Prompt: ${prompt}`);

  const ai = new GoogleGenAI({ apiKey });

  let response;
  try {
    response = await ai.models.generateContent({
      model: modelId,
      contents: fullPrompt,
      config: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    });
  } catch (err) {
    throw ImageGenError.fromError(err);
  }
  const parts = response.candidates?.[0]?.content?.parts;

  if (!parts) {
    throw new ImageGenError("No response from image generation model");
  }

  const imagePart = parts.find((p) => p.inlineData?.mimeType?.startsWith("image/"));

  // @google/genai types both fields as optional, so narrow them rather than
  // assert — a part with a mimeType but no data would otherwise blow up below.
  const mimeType = imagePart?.inlineData?.mimeType;
  const base64Data = imagePart?.inlineData?.data;
  if (!mimeType || !base64Data) {
    throw new ImageGenError("No image generated — model returned text only");
  }

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
    key: blob.pathname,
    imageType,
    base64: base64Data,
    mimeType,
  };
}
