import { NextRequest, NextResponse } from "next/server";
import {
  generateForm,
  HistoryTurn,
  StyleGuide,
  GeneratedImage,
  ImageGenerator,
} from "@/lib/gemini";
import { FormStructure } from "@/lib/scraper";

export async function POST(req: NextRequest) {
  try {
    const {
      structure,
      prompt,
      history,
      previousHtml,
      screenshotBase64,
      styleGuide,
      includeImages,
      activeImages,
    }: {
      structure: FormStructure;
      prompt: string;
      history: HistoryTurn[];
      previousHtml: string;
      screenshotBase64?: string;
      styleGuide?: StyleGuide;
      includeImages?: boolean;
      activeImages?: GeneratedImage[];
    } = await req.json();

    if (!structure || !prompt) {
      return NextResponse.json(
        { error: "structure and prompt are required" },
        { status: 400 }
      );
    }

    const submitUrl = `${req.nextUrl.origin}/api/submit/${structure.formId}`;

    // Create image generator callback that calls our generate-image API
    const imageGenerator: ImageGenerator = async (params) => {
      const res = await fetch(
        `${req.nextUrl.origin}/api/generate-image`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Image generation failed");
      return data as GeneratedImage;
    };

    const result = await generateForm(
      structure,
      prompt,
      history ?? [],
      previousHtml ?? "",
      submitUrl,
      screenshotBase64,
      styleGuide,
      includeImages ?? false,
      imageGenerator,
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
