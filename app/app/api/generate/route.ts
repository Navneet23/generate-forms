import { NextRequest, NextResponse } from "next/server";
import {
  generateForm,
  HistoryTurn,
  StyleGuide,
  GeneratedImage,
} from "@/lib/gemini";
import { FormStructure } from "@/lib/scraper";
import { generateImage, ImageModelId } from "@/lib/image-gen";

export async function POST(req: NextRequest) {
  try {
    const {
      structure,
      prompt,
      history,
      previousHtml,
      screenshotBase64,
      styleGuide,
      imageModel,
      activeImages,
    }: {
      structure: FormStructure;
      prompt: string;
      history: HistoryTurn[];
      previousHtml: string;
      screenshotBase64?: string;
      styleGuide?: StyleGuide;
      imageModel?: ImageModelId | "none";
      activeImages?: GeneratedImage[];
    } = await req.json();

    if (!structure || !prompt) {
      return NextResponse.json(
        { error: "structure and prompt are required" },
        { status: 400 }
      );
    }

    const submitUrl = `${req.nextUrl.origin}/api/submit/${structure.formId}`;
    const includeImages = imageModel != null && imageModel !== "none";
    const boundImageGenerator = includeImages
      ? (params: { prompt: string; imageType: "background" | "header" | "accent"; colorPalette: string; aspectRatio: string }) =>
          generateImage({ ...params, modelId: imageModel as ImageModelId })
      : undefined;

    const result = await generateForm(
      structure,
      prompt,
      history ?? [],
      previousHtml ?? "",
      submitUrl,
      screenshotBase64,
      styleGuide,
      includeImages,
      boundImageGenerator,
      activeImages
    );

    return NextResponse.json({
      html: result.html,
      generatedImages: result.images,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
