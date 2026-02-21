import { NextRequest, NextResponse } from "next/server";
import { generateForm, HistoryTurn, StyleGuide } from "@/lib/gemini";
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
    }: {
      structure: FormStructure;
      prompt: string;
      history: HistoryTurn[];
      previousHtml: string;
      screenshotBase64?: string;
      styleGuide?: StyleGuide;
    } = await req.json();

    if (!structure || !prompt) {
      return NextResponse.json(
        { error: "structure and prompt are required" },
        { status: 400 }
      );
    }

    const submitUrl = `${req.nextUrl.origin}/api/submit/${structure.formId}`;

    const html = await generateForm(
      structure,
      prompt,
      history ?? [],
      previousHtml ?? "",
      submitUrl,
      screenshotBase64,
      styleGuide
    );

    return NextResponse.json({ html });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
