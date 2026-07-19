import {
  GoogleGenerativeAI,
  Part,
  SchemaType,
  FunctionDeclaration,
  Tool,
} from "@google/generative-ai";
import { FormStructure } from "./scraper";
import {
  validateGeneratedForm,
  validationErrors,
  buildCorrectionPrompt,
  Violation,
} from "./validate-form";
import fs from "fs";
import path from "path";

const MODEL_ID = "gemini-3-flash-preview";

const IS_LOCAL = !process.env.VERCEL;
const LOG_FILE = IS_LOCAL ? path.join(process.cwd(), "debug.log") : null;

function log(...args: unknown[]) {
  const line = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a, null, 2))).join(" ");
  console.log(line);
  if (LOG_FILE) fs.appendFileSync(LOG_FILE, line + "\n");
}

export interface HistoryTurn {
  role: "user" | "model";
  text: string;
}

export interface StyleGuide {
  imageBase64: string; // data:image/png;base64,... or raw base64
  focusNote: string;
}

export interface GeneratedImage {
  url: string;
  key: string;
  imageType: "background" | "header" | "accent";
  base64: string;
  mimeType: string;
}

// TASK-2: Progress event type for generation timeline
export type ProgressEvent = {
  type: "step";
  step: string;
  status: "started" | "completed" | "failed";
  detail?: string;
  imageType?: string;
  imageIndex?: number;
  imageCount?: number;
};

// Function declaration for generate_image tool
const generateImageFunctionDecl: FunctionDeclaration = {
  name: "generate_image",
  description:
    "Generate an AI image to use in the form design. Call this when an image would enhance the form — for example, a header banner, background image, or accent image. Do not call this for simple surveys or internal forms that don't benefit from images.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      prompt: {
        type: SchemaType.STRING,
        description:
          "Detailed image generation prompt. Be specific about style, mood, composition, and subject. Never request text/words/letters in the image.",
      },
      imageType: {
        type: SchemaType.STRING,
        format: "enum",
        description:
          "How this image will be used: 'background' for full-page/section backgrounds (subtle, low-contrast), 'header' for top banner images (visually striking), 'accent' for decorative/content images.",
        enum: ["background", "header", "accent"],
      },
      colorPalette: {
        type: SchemaType.STRING,
        description:
          "Dominant colors the image should use, so you can match form colors to complement it. E.g. 'warm oranges, soft yellows, cream'.",
      },
      aspectRatio: {
        type: SchemaType.STRING,
        description:
          "Desired aspect ratio. Use '16:9' for headers, '1:1' for accent images, or 'flexible' for backgrounds.",
      },
    },
    required: ["prompt", "imageType", "colorPalette", "aspectRatio"],
  },
};

// TASK-1: Function declaration for announce_plan tool
const announcePlanFunctionDecl: FunctionDeclaration = {
  name: "announce_plan",
  description:
    "Announce your visual design plan before generating the form. You MUST call this function first, before generating any HTML or calling generate_image. Describe only visual/layout decisions (colors, fonts, layout style, images). Your plan must NEVER include changing question text, option labels, or form title — those are immutable.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      summary: {
        type: SchemaType.STRING,
        description:
          "A brief 1-2 sentence summary of your visual design plan: what style/theme, colors, and layout you will use, and whether images will be included. Do NOT mention changing any form text content — only describe visual changes.",
      },
    },
    required: ["summary"],
  },
};

// QI-1/QI-2: Canonical Google Forms footer — mirrors the real Google Forms responder
// footer: notices, links (Contact form owner / Terms / Privacy / Report abuse) and the
// grey "Google Forms" text wordmark. Provided verbatim in the SI so the model copies it
// exactly; data-gforms-footer lets the future validator find it.
function buildGoogleFormsFooter(formId: string): string {
  const formUrl = `https://docs.google.com/forms/d/e/${formId}/viewform`;
  return `<footer data-gforms-footer style="font-size:12px;line-height:1.8;text-align:center;font-family:Arial,Helvetica,sans-serif;">
  <div>Never submit passwords through Google Forms.</div>
  <div>This content is neither created nor endorsed by Google. - <a href="${formUrl}" target="_blank" rel="noopener">Contact form owner</a> - <a href="https://policies.google.com/terms" target="_blank" rel="noopener">Terms of Service</a> - <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">Privacy Policy</a></div>
  <div>Does this form look suspicious? <a href="https://docs.google.com/forms/d/e/${formId}/abuse" target="_blank" rel="noopener">Report</a></div>
  <div aria-label="Google Forms" style="font-size:20px;color:#5f6368;margin-top:14px;"><span style="font-weight:500;">Google</span> <span style="font-weight:400;">Forms</span></div>
</footer>`;
}

function buildSystemPrompt(structure: FormStructure, submitUrl: string, includeImages?: boolean): string {
  return `You are an expert frontend developer who specialises in building beautiful, custom HTML forms.

You will be given a Google Form structure and a styling request. Your job is to output a COMPLETE, SELF-CONTAINED HTML page that renders the form with the requested visual design.

CRITICAL — PRESERVE FORM CONTENT EXACTLY:
- Do NOT change the form title, description, question text, question types, or answer options. These must appear in the generated HTML exactly as they are in the structure JSON.
- A dropdown must stay a dropdown, a checkbox must stay a checkbox, a multiple_choice must stay radio buttons, etc. Never convert one question type to another.
- Option values must match the structure JSON character-for-character. Do not rephrase, reformat, or embellish option text.
- You are only allowed to change the VISUAL STYLING and LAYOUT — never the content or behaviour of the form fields.
- Even if the user asks to "make it fun", "make it quirky", or similar — that applies ONLY to visual design (colors, fonts, animations, layout, images). The text content of questions, options, title, and description must NEVER change.

RULES — you must follow all of these:
1. Output ONLY raw HTML. No markdown, no code fences, no explanation. The very first character of your response must be "<" and the last must be ">".
2. All CSS must be inline in a <style> tag inside <head>. No external stylesheets.
3. All JavaScript must be inline in a <script> tag. No external scripts.
4. Every form input must use the exact name attribute provided (e.g. name="entry.1234567890"). These are critical for routing responses correctly.
5. The form must submit via JavaScript fetch POST to: ${submitUrl}
   Send JSON body: an object mapping each entry.XXXXXXXXX name to its value.
   For checkbox questions where multiple options can be selected, send the value as an array of strings (e.g. ["Option A", "Option B"]).
   On success show a thank-you message. On error show a friendly error message.
   If you generate a multi-step form, collect ALL field values across ALL steps before submitting — never submit with missing or empty values from earlier steps.
6. The form must be fully responsive and work on mobile. No fixed pixel widths on the main form container — use a max-width content column with auto margins on wide screens. Question text, answer options, and input text must be at least 16px on mobile (secondary text like helper hints and the rule-18 footer is exempt and should stay small). Spacing must adapt to screen size: on narrow screens (≤480px) reduce horizontal padding to 16-24px and compress vertical gaps — never reuse large desktop padding/margin values unchanged on mobile. Cards, steps, and containers must size to their content: never give them fixed heights, large min-heights, or space-between stretching that leaves big empty gaps between a question and its Next button. (Rule 11's full-viewport background applies to the PAGE background only — not to the form card.)
7. Render ALL questions from the structure in order. Do not skip any. Always render the form title and description at the top.
8. For required fields, add visible indication and client-side validation before submit. ⚠️ Only mark a field as required if its "required" property is true in the structure JSON. If a question has "required": false, it MUST remain optional — do not add required attributes, asterisks, or validation to optional fields.
9. For linear_scale questions, render them as a single horizontal row of numbered radio buttons. The min label appears below the lowest number and the max label appears below the highest number. Labels and numbers must be aligned in one clean row — never stack them vertically or misalign them. On narrow screens the row must compress evenly while keeping touch targets at least ~40px; if the scale genuinely cannot fit, allow horizontal scrolling within the scale container — never overflow the viewport or clip the endpoint labels.
10. If generating a multi-step form with a review page, the review page must display the actual values the user entered, not placeholder text like "No answer provided".
11. The page must always fill the full viewport (min-height: 100vh) with a background colour — never leave a plain white or transparent background. Choose a colour that fits the requested style.
12. ⚠️ VISUAL DISTINCTION & SELECTION FEEDBACK:
    - multiple_choice (radio buttons): render each option with a ROUND radio indicator (○ / ●). Only ONE option can be selected at a time.
    - checkboxes: render each option with a SQUARE checkbox indicator (☐ / ☑). MULTIPLE options can be selected. Always add a helper text below the question such as "Select all that apply" to make it clear multiple selections are allowed.
    - These two types must NEVER look the same. The visual indicator shape (round vs square) and the selection hint are required to distinguish them.
    - Every selectable option (radio, checkbox, dropdown, linear-scale point) must have a clearly visible SELECTED state — a filled indicator AND a background or border change — plus a hover state on pointer devices and a visible keyboard-focus state. A respondent must never be unsure whether their selection registered.
13. LAYOUT CHOICE: if the creator's request or style guide specifies or clearly implies a layout (e.g. single-page, question-by-question, multi-section), follow it exactly. If no layout is specified, choose whichever layout best fits the form's length and tone. Never mix layouts within one form. On iterative edits, preserve the existing layout unless the creator asks to change it.
14. ⚠️ QUESTION-BY-QUESTION LAYOUT RULES (apply whenever showing one question per step):
    a. The final step MUST always be a review page that shows every answer the user gave before they submit. There are no exceptions — never skip the review step.
    b. For single-selection questions (multiple_choice, dropdown, linear_scale), auto-advance on selection is allowed. However, a "Next" button must ALSO be present on these steps so the user can navigate manually.
    c. For multi-input questions (checkboxes, short_answer, paragraph, date, time), do NOT auto-advance — the user must click "Next" to proceed.
    d. Every step after the first must include a "Back" button that returns the user to the previous step. The review page must also have a Back button. Only the very first question step should have no Back button.
    e. When the user clicks "Next" on a required question without providing an answer, show a validation message (e.g. "This question is required") and do NOT advance. Optional questions may be skipped freely.
    f. Pressing the Enter key on any step must advance the user to the next step (same as clicking "Next"), subject to the same required-field validation. Exception: do not intercept Enter inside a <textarea> (paragraph questions) — allow normal line-break behaviour there.
15. PLACEHOLDERS: text inputs may use only generic placeholder text — "Your answer" for short_answer and paragraph, or a neutral format hint (e.g. "DD/MM/YYYY") for date/time. Never invent themed, decorative, or question-specific placeholder copy.
16. CONTRAST: all text must meet approximately WCAG AA contrast — 4.5:1 for body text, 3:1 for large headings — against its actual rendered background. When text sits on an image or gradient, add an overlay or text shadow sufficient to restore contrast. This includes the footer notices (rule 18).
17. OVERFLOW: never clip or overflow text. All text must wrap within its container (use overflow-wrap), long question text and option labels must wrap gracefully, and text containers must not have fixed heights. Any intentionally scrollable region must show a scrollbar. Check against the longest question and option text in the structure.
18. ⚠️ GOOGLE FORMS FOOTER — required on every generated form. The page must end with this footer, copied EXACTLY as given below. You may adjust its spacing, alignment, font size, and mute its text colour to harmonise with the design — but NEVER change the notice text, the link labels, the link URLs, or the "Google Forms" wordmark:
${buildGoogleFormsFooter(structure.formId)}
    - The "Google Forms" wordmark must remain grey text exactly as given — never replace it with an icon, logo image, or SVG.
    - Keep the footer's inline font sizes exactly as given (12px notices, 20px wordmark) on ALL screen sizes — the footer is secondary text and is exempt from rule 6's 16px minimum. Do not scale it up, and do not let it inherit the page's display font.
    - Footer links must be visibly underlined. The footer must stay legible and meet the contrast rule (16).
    - In multi-step layouts, the footer must appear at minimum on the first step and the final (review) step.

${includeImages ? `IMAGE GENERATION GUIDELINES (when the generate_image tool is available):
- You have access to a generate_image tool that creates AI images for the form.
- Decide whether images would genuinely enhance this form. Good candidates: event registrations, creative/branded forms, themed forms. Poor candidates: simple internal surveys, feedback forms, plain data collection.
- If you decide images would help, call generate_image with a detailed, specific prompt. Describe the style, mood, subject, and composition. Never request text/words/letters in images.
- You can call generate_image multiple times for different image types (e.g. one header + one background).
- After receiving generated images, you will see them as vision input. Use the actual colors in the image to pick complementary form colors (background, text, buttons, borders) for visual coherence.
- For background images: use CSS background-image with background-size: cover. Always add a semi-transparent overlay so form text remains readable.
- For header images: place at the top with appropriate height (200-300px), use object-fit: cover, make it responsive.
- For accent images: size appropriately and position to support the form theme without overwhelming the content.
- Reference generated images by their returned URL in the HTML.` : `IMAGE RULES:
- Do NOT include any images in the form. Do not use <img> tags, background-image CSS, or any external image URLs. The form should be styled with colors, gradients, and CSS only. (The text-based Google Forms footer required by rule 18 is unaffected by this rule.)`}

The form structure is:
${JSON.stringify(structure, null, 2)}

⚠️ REMINDER — Each question's "type" field above is AUTHORITATIVE. Here is a summary for quick reference:
${structure.questions.map((q, i) => `  ${i + 1}. "${q.text}" → type: ${q.type} (render as ${q.type === "checkboxes" ? "checkboxes (multiple selections allowed)" : q.type === "dropdown" ? "a <select> dropdown (single selection)" : q.type === "multiple_choice" ? "radio buttons (single selection)" : q.type})`).join("\n")}
Do NOT swap, change, or reinterpret any of these types.

IMPORTANT — ANNOUNCE YOUR PLAN FIRST:
Before generating any HTML or calling generate_image, you MUST call the announce_plan function with a brief summary of your VISUAL design plan. This helps the user understand what you are building. Always call announce_plan as your very first action.
Remember: your plan and output must NEVER alter form text content. The title, description, question text, and option labels from the structure JSON above are READ-ONLY — copy them verbatim into the HTML.`;
}

function toInlineData(base64WithPrefix: string): { mimeType: string; data: string } {
  // Handle both "data:image/png;base64,XXX" and raw base64
  const match = base64WithPrefix.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (match) return { mimeType: match[1], data: match[2] };
  return { mimeType: "image/png", data: base64WithPrefix };
}

// Callback type for image generation — called by the API route
export type ImageGenerator = (params: {
  prompt: string;
  imageType: "background" | "header" | "accent";
  colorPalette: string;
  aspectRatio: string;
}) => Promise<GeneratedImage>;

export async function generateForm(
  structure: FormStructure,
  userPrompt: string,
  history: HistoryTurn[],
  previousHtml: string,
  submitUrl: string,
  screenshotBase64?: string,
  styleGuide?: StyleGuide,
  includeImages?: boolean,
  imageGenerator?: ImageGenerator,
  activeImages?: GeneratedImage[],
  onProgress?: (event: ProgressEvent) => void
): Promise<{
  html: string;
  images: GeneratedImage[];
  imageErrors: { code: number | null; message: string }[];
  validation?: { violations: Violation[]; retries: number };
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const genAI = new GoogleGenerativeAI(apiKey);

  // Build tools array — always include announce_plan, conditionally include generate_image
  const functionDeclarations: FunctionDeclaration[] = [announcePlanFunctionDecl];
  if (includeImages && imageGenerator) {
    functionDeclarations.push(generateImageFunctionDecl);
  }
  const tools: Tool[] = [{ functionDeclarations }];

  const systemPrompt = buildSystemPrompt(structure, submitUrl, includeImages);
  if (LOG_FILE) {
    fs.writeFileSync(LOG_FILE, `=== Debug log started at ${new Date().toISOString()} ===\n`);
  }
  log("\n=== [GEMINI] SYSTEM PROMPT ===");
  log(systemPrompt);
  log("=== [GEMINI] END SYSTEM PROMPT ===\n");

  log("[GEMINI] Model:", MODEL_ID);
  log("[GEMINI] Include images:", includeImages);
  log("[GEMINI] Tools provided:", functionDeclarations.map(f => f.name).join(", "));
  log("[GEMINI] Active images from previous turns:", activeImages?.length ?? 0);
  log("[GEMINI] History turns:", history.length, "(using last", Math.min(history.length, 10), ")");

  const model = genAI.getGenerativeModel({
    model: MODEL_ID,
    systemInstruction: systemPrompt,
    ...(tools.length > 0 ? { tools } : {}),
  });

  const recentHistory = history.slice(-10);

  const chat = model.startChat({
    history: recentHistory.map((turn) => ({
      role: turn.role,
      parts: [{ text: turn.text }],
    })),
  });

  // Build the user message parts
  const parts: Part[] = [];

  log("\n=== [GEMINI] BUILDING USER MESSAGE PARTS ===");

  // Style guide image — reference only, never embedded
  if (styleGuide?.imageBase64) {
    const { mimeType, data } = toInlineData(styleGuide.imageBase64);
    parts.push({
      inlineData: { mimeType, data },
    });
    const focusText = styleGuide.focusNote
      ? ` Focus specifically on: ${styleGuide.focusNote}.`
      : "";
    parts.push({
      text: `The image above is a visual style guide. Deliberately extract and apply its visual language: colour palette (dominant + accent colours), typography feel (serif/sans, weight, formality), spacing and density, corner radius and border treatment, and overall mood.${focusText} If the creator's request asks to follow this image's layout, replicate its layout/structure as closely as the form content allows; otherwise use it only as a visual style reference and do not clone its layout. Never embed this image itself in the form.`,
    });
    log("[GEMINI] Part: style guide image (inlineData) + text");
  }

  // Re-send active generated images so Gemini can see them for color coherence
  if (activeImages && activeImages.length > 0) {
    for (const img of activeImages) {
      parts.push({
        inlineData: { mimeType: img.mimeType, data: img.base64 },
      });
      parts.push({
        text: `This is an existing ${img.imageType} image currently used in the form (URL: ${img.url}). You can keep it, replace it, or remove it as needed.`,
      });
      log(`[GEMINI] Part: active ${img.imageType} image (inlineData + URL: ${img.url})`);
    }
  }

  // Screenshot of a selected region — shows the creator what to change
  if (screenshotBase64) {
    const { mimeType, data } = toInlineData(screenshotBase64);
    parts.push({ inlineData: { mimeType, data } });
    parts.push({
      text: "The image above is a screenshot of the region the creator wants to change.",
    });
    log("[GEMINI] Part: screenshot region (inlineData) + text");
  }

  // Main prompt text
  const promptText = previousHtml
    ? `Current form HTML:\n${previousHtml}\n\nCreator request: ${userPrompt}\n\nUpdate the form to fulfil this request. Return the complete updated HTML page.`
    : `Creator request: ${userPrompt}\n\nGenerate the complete HTML page for this form.`;

  parts.push({ text: promptText });
  log("[GEMINI] Part: main prompt text ↓");
  log(promptText.length > 500 ? promptText.slice(0, 500) + `... [truncated, ${promptText.length} chars total]` : promptText);
  log(`[GEMINI] Total parts in user message: ${parts.length}`);
  log("=== [GEMINI] END USER MESSAGE PARTS ===\n");

  // Send message and handle function calling loop
  log("[GEMINI] >>> Sending initial message to Gemini...");
  onProgress?.({ type: "step", step: "analyze", status: "started" });
  let response = await chat.sendMessage(parts);
  // Auto-complete analyze when first response arrives
  onProgress?.({ type: "step", step: "analyze", status: "completed" });
  const generatedImages: GeneratedImage[] = [];
  const imageErrors: { code: number | null; message: string }[] = [];

  // TASK-1 & TASK-9: Track whether announce_plan was called
  let announcePlanCalled = false;

  // Function calling loop — Gemini may call announce_plan and/or generate_image
  let loopIteration = 0;
  while (true) {
    loopIteration++;
    const candidate = response.response.candidates?.[0];
    if (!candidate) {
      log("[GEMINI] No candidate in response — exiting loop");
      break;
    }

    const functionCalls = candidate.content?.parts?.filter(
      (p: Part) => "functionCall" in p && p.functionCall
    );

    if (!functionCalls || functionCalls.length === 0) {
      log(`[GEMINI] Loop iteration ${loopIteration}: No function calls — Gemini returned final text response`);
      const textPreview = response.response.text();
      log(`[GEMINI] Response text preview: ${textPreview.slice(0, 200)}...`);
      break;
    }

    log(`\n=== [GEMINI] FUNCTION CALLING — Loop iteration ${loopIteration} ===`);
    log(`[GEMINI] Gemini requested ${functionCalls.length} function call(s)`);

    // TASK-1: Sort function calls so announce_plan is processed before generate_image
    const sortedFunctionCalls = [...functionCalls].sort((a, b) => {
      const nameA = ("functionCall" in a && a.functionCall?.name) || "";
      const nameB = ("functionCall" in b && b.functionCall?.name) || "";
      if (nameA === "announce_plan") return -1;
      if (nameB === "announce_plan") return 1;
      return 0;
    });

    // Process all function calls — separate functionResponse parts from vision parts
    const functionResponses: Part[] = [];
    const visionFollowUp: Part[] = [];

    // Count image calls in this batch for progress tracking
    const imageCallsInBatch = sortedFunctionCalls.filter(
      (p) => "functionCall" in p && p.functionCall?.name === "generate_image"
    ).length;
    let imageIndexInBatch = 0;
    // Snapshot the count before this batch so numbering is stable
    const imagesBeforeBatch = generatedImages.length;

    for (const part of sortedFunctionCalls) {
      if (!("functionCall" in part) || !part.functionCall) continue;

      const { name, args } = part.functionCall;

      log(`[GEMINI] Function call: ${name}`);
      log(`[GEMINI] Args:`, JSON.stringify(args, null, 2));

      // TASK-1: Handle announce_plan
      if (name === "announce_plan") {
        const typedArgs = args as Record<string, string>;
        const summary = typedArgs.summary || "";
        log(`[GEMINI] Plan announced: ${summary}`);
        announcePlanCalled = true;

        onProgress?.({ type: "step", step: "plan", status: "completed", detail: summary });

        functionResponses.push({
          functionResponse: {
            name: "announce_plan",
            response: { success: true },
          },
        } as Part);
      } else if (name === "generate_image" && imageGenerator) {
        imageIndexInBatch++;
        const currentImageIndex = imagesBeforeBatch + imageIndexInBatch;
        const totalImageCount = imagesBeforeBatch + imageCallsInBatch;

        try {
          log(`[GEMINI] >>> Calling image generator...`);
          const typedArgs = args as Record<string, string>;

          onProgress?.({
            type: "step",
            step: "image_gen",
            status: "started",
            detail: typedArgs.prompt,
            imageType: typedArgs.imageType,
            imageIndex: currentImageIndex,
            imageCount: totalImageCount,
          });

          const image = await imageGenerator({
            prompt: typedArgs.prompt,
            imageType: typedArgs.imageType as "background" | "header" | "accent",
            colorPalette: typedArgs.colorPalette,
            aspectRatio: typedArgs.aspectRatio,
          });

          generatedImages.push(image);

          log(`[GEMINI] <<< Image generated successfully!`);
          log(`[GEMINI]     URL: ${image.url}`);
          log(`[GEMINI]     Type: ${image.imageType}`);
          log(`[GEMINI]     MIME: ${image.mimeType}`);
          log(`[GEMINI]     Base64 size: ${image.base64.length} chars`);

          onProgress?.({
            type: "step",
            step: "image_gen",
            status: "completed",
            imageType: image.imageType,
            imageIndex: currentImageIndex,
            imageCount: totalImageCount,
          });

          // functionResponse goes in first message (cannot mix with other types)
          functionResponses.push({
            functionResponse: {
              name: "generate_image",
              response: {
                url: image.url,
                imageType: image.imageType,
                success: true,
              },
            },
          } as Part);

          // Vision input goes in a separate follow-up message
          visionFollowUp.push({
            inlineData: { mimeType: image.mimeType, data: image.base64 },
          });
          visionFollowUp.push({
            text: `Above is the generated ${image.imageType} image. Its CDN URL is: ${image.url}. Use this URL in the HTML. Pick form colors that complement this image.`,
          });
        } catch (err) {
          const errorMsg =
            err instanceof Error ? err.message : "Image generation failed";
          const errorCode = (err as { code?: number }).code ?? null;
          log(`[GEMINI] <<< Image generation FAILED (${errorCode}): ${errorMsg}`);
          imageErrors.push({ code: errorCode, message: errorMsg });

          onProgress?.({
            type: "step",
            step: "image_gen",
            status: "failed",
            detail: errorMsg,
            imageType: (args as Record<string, string>).imageType,
            imageIndex: currentImageIndex,
            imageCount: totalImageCount,
          });

          functionResponses.push({
            functionResponse: {
              name: "generate_image",
              response: {
                success: false,
                error: errorMsg,
              },
            },
          } as Part);
        }
      }
    }

    // Send function responses first (functionResponse-only message)
    log(`[GEMINI] >>> Sending ${functionResponses.length} function response(s) back to Gemini...`);
    log(`=== [GEMINI] END FUNCTION CALLING — Loop iteration ${loopIteration} ===\n`);
    response = await chat.sendMessage(functionResponses);

    // Then send vision follow-up so Gemini can see the actual images for color picking
    if (visionFollowUp.length > 0) {
      log(`[GEMINI] >>> Sending ${visionFollowUp.length} vision follow-up part(s) (images + instructions)...`);
      onProgress?.({ type: "step", step: "color_match", status: "started" });
      response = await chat.sendMessage(visionFollowUp);
      onProgress?.({ type: "step", step: "color_match", status: "completed" });
    }
  }

  // TASK-9: If announce_plan was never called, emit a fallback plan event
  if (!announcePlanCalled) {
    onProgress?.({ type: "step", step: "plan", status: "completed", detail: "Generating form based on your request" });
  }

  // TASK-2: Emit html_gen events
  onProgress?.({ type: "step", step: "html_gen", status: "started" });

  const stripFences = (t: string) =>
    t
      .replace(/^```html\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

  let html = stripFences(response.response.text());

  log("\n=== [GEMINI] FINAL RESULT ===");
  log(`[GEMINI] Generated HTML length: ${html.length} chars`);
  log(`[GEMINI] HTML preview: ${html.slice(0, 200)}...`);
  log(`[GEMINI] Total images generated: ${generatedImages.length}`);
  if (generatedImages.length > 0) {
    generatedImages.forEach((img, i) => {
      log(`[GEMINI]   Image ${i + 1}: ${img.imageType} → ${img.url}`);
    });
  }
  log("=== [GEMINI] END FINAL RESULT ===\n");

  onProgress?.({ type: "step", step: "html_gen", status: "completed" });

  // QI-4/QI-6: validate the generated HTML against the form structure and
  // submit contract; on error-severity violations, ask the model to correct
  // itself (bounded retries), never hard-failing a generation the creator
  // could still accept.
  const MAX_VALIDATION_RETRIES = 2;
  onProgress?.({ type: "step", step: "validate", status: "started" });
  let violations = validateGeneratedForm(html, structure, submitUrl);
  let retries = 0;
  while (validationErrors(violations).length > 0 && retries < MAX_VALIDATION_RETRIES) {
    retries++;
    const errs = validationErrors(violations);
    log(`[GEMINI] Validation found ${errs.length} error(s); corrective retry ${retries}/${MAX_VALIDATION_RETRIES}`);
    errs.forEach((v) => log(`[GEMINI]   - ${v.code}: ${v.message}`));
    onProgress?.({
      type: "step",
      step: "validate",
      status: "started",
      detail: `Fixing ${errs.length} issue${errs.length === 1 ? "" : "s"} (attempt ${retries})`,
    });
    const corrected = await chat.sendMessage(buildCorrectionPrompt(violations));
    html = stripFences(corrected.response.text());
    violations = validateGeneratedForm(html, structure, submitUrl);
  }
  const finalErrors = validationErrors(violations);
  if (finalErrors.length === 0) {
    onProgress?.({
      type: "step",
      step: "validate",
      status: "completed",
      detail: retries > 0 ? `Passed after ${retries} fix attempt${retries === 1 ? "" : "s"}` : undefined,
    });
  } else {
    log(`[GEMINI] Validation still failing after ${retries} retries: ${finalErrors.map((v) => v.code).join(", ")}`);
    onProgress?.({
      type: "step",
      step: "validate",
      status: "failed",
      detail: `${finalErrors.length} unresolved issue${finalErrors.length === 1 ? "" : "s"} — review before publishing`,
    });
  }

  return {
    html,
    images: generatedImages,
    imageErrors,
    validation: violations.length > 0 || retries > 0 ? { violations, retries } : undefined,
  };
}
