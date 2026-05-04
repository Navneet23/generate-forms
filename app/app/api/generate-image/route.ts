import { NextRequest, NextResponse } from "next/server";
import { generateImage, ImageGenError } from "@/lib/image-gen";

export async function POST(req: NextRequest) {
  try {
    const { prompt, imageType, colorPalette, aspectRatio, modelId } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const result = await generateImage({ prompt, imageType, colorPalette, aspectRatio, modelId: modelId ?? "gemini-2.5-flash-image" });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const imgErr = err instanceof ImageGenError ? err : ImageGenError.fromError(err);
    console.error("[IMAGE-GEN] ERROR:", imgErr.code, imgErr.message);
    return NextResponse.json(
      { error: imgErr.message, code: imgErr.code },
      { status: imgErr.code ?? 500 }
    );
  }
}
