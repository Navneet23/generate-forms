import { NextRequest, NextResponse } from "next/server";
import {
  generateForm,
  HistoryTurn,
  StyleGuide,
  GeneratedImage,
  ProgressEvent,
  TextModelId,
  DEFAULT_TEXT_MODEL,
  TEXT_MODEL_IDS,
} from "@/lib/gemini";
import { FormStructure } from "@/lib/scraper";
import { generateImage, ImageModelId } from "@/lib/image-gen";

/**
 * SSE streaming endpoint for form generation.
 *
 * Streams progress events as Server-Sent Events (SSE) during generation,
 * then sends a final result event with the generated HTML.
 *
 * Event format: `data: {json}\n\n`
 *
 * Event types:
 *   Step event (emitted during generation):
 *     { type: "step", step: string, status: "started"|"completed"|"failed", detail?: string, imageType?: string, imageIndex?: number, imageCount?: number }
 *
 *   Result event (final, contains HTML):
 *     { type: "result", html: string, generatedImages: GeneratedImage[], imageErrors?: { code: number|null, message: string }[] }
 *
 *   Error event (on unrecoverable failure):
 *     { type: "error", message: string }
 *
 * Steps emitted in order: analyze -> plan -> image_gen* -> color_match* -> html_gen
 * Image steps repeat per image with imageIndex/imageCount fields.
 */
export async function POST(req: NextRequest) {
  const {
    structure,
    prompt,
    history,
    previousHtml,
    screenshotBase64,
    styleGuide,
    imageModel,
    textModel,
    activeImages,
  }: {
    structure: FormStructure;
    prompt: string;
    history: HistoryTurn[];
    previousHtml: string;
    screenshotBase64?: string;
    styleGuide?: StyleGuide;
    imageModel?: ImageModelId | "none";
    textModel?: TextModelId;
    activeImages?: GeneratedImage[];
  } = await req.json();

  if (!structure || !prompt) {
    return NextResponse.json(
      { error: "structure and prompt are required" },
      { status: 400 }
    );
  }

  // The body is client-supplied, so never forward an unrecognised id to Gemini.
  const selectedTextModel = TEXT_MODEL_IDS.includes(textModel as TextModelId)
    ? (textModel as TextModelId)
    : DEFAULT_TEXT_MODEL;

  const submitUrl = `${req.nextUrl.origin}/api/submit/${structure.formId}`;
  const includeImages = imageModel != null && imageModel !== "none";
  const boundImageGenerator = includeImages
    ? (params: { prompt: string; imageType: "background" | "header" | "accent"; colorPalette: string; aspectRatio: string }) =>
        generateImage({ ...params, modelId: imageModel as ImageModelId })
    : undefined;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Client disconnected, ignore
        }
      };

      try {
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
          activeImages,
          send,
          selectedTextModel
        );

        send({
          type: "result",
          html: result.html,
          generatedImages: result.images,
          imageErrors: result.imageErrors.length > 0 ? result.imageErrors : undefined,
          validation: result.validation,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Generation failed";
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
