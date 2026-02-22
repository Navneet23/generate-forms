import { NextRequest, NextResponse } from "next/server";
import { generateImage } from "@/lib/image-gen";

export async function POST(req: NextRequest) {
  try {
    const { prompt, imageType, colorPalette, aspectRatio } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const result = await generateImage({ prompt, imageType, colorPalette, aspectRatio });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Image generation failed";
    console.error("[IMAGE-GEN] ERROR:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
