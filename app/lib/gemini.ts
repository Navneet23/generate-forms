import {
  GoogleGenerativeAI,
  Part,
  SchemaType,
  FunctionDeclaration,
  Tool,
} from "@google/generative-ai";
import { FormStructure } from "./scraper";
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
  imageType: "background" | "header" | "accent";
  base64: string;
  mimeType: string;
}

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

function buildSystemPrompt(structure: FormStructure, submitUrl: string, includeImages?: boolean): string {
  return `You are an expert frontend developer who specialises in building beautiful, custom HTML forms.

You will be given a Google Form structure and a styling request. Your job is to output a COMPLETE, SELF-CONTAINED HTML page that renders the form with the requested visual design.

CRITICAL — PRESERVE FORM CONTENT EXACTLY:
- Do NOT change the form title, description, question text, question types, or answer options. These must appear in the generated HTML exactly as they are in the structure JSON.
- A dropdown must stay a dropdown, a checkbox must stay a checkbox, a multiple_choice must stay radio buttons, etc. Never convert one question type to another.
- Option values must match the structure JSON character-for-character. Do not rephrase, reformat, or embellish option text.
- You are only allowed to change the VISUAL STYLING and LAYOUT — never the content or behaviour of the form fields.

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
6. The form must be fully responsive and work on mobile.
7. Render ALL questions from the structure in order. Do not skip any. Always render the form title and description at the top.
8. For required fields, add visible indication and client-side validation before submit. ⚠️ Only mark a field as required if its "required" property is true in the structure JSON. If a question has "required": false, it MUST remain optional — do not add required attributes, asterisks, or validation to optional fields.
9. For linear_scale questions, render them as a single horizontal row of numbered radio buttons. The min label appears below the lowest number and the max label appears below the highest number. Labels and numbers must be aligned in one clean row — never stack them vertically or misalign them.
10. If generating a multi-step form with a review page, the review page must display the actual values the user entered, not placeholder text like "No answer provided".
11. The page must always fill the full viewport (min-height: 100vh) with a background colour — never leave a plain white or transparent background. Choose a colour that fits the requested style.
12. ⚠️ QUESTION-BY-QUESTION LAYOUT RULES (apply whenever showing one question per step):
    a. The final step MUST always be a review page that shows every answer the user gave before they submit. There are no exceptions — never skip the review step.
    b. For questions that accept only a SINGLE selection (multiple_choice, dropdown, linear_scale), automatically advance to the next step as soon as the user makes their selection. Do NOT wait for a "Next" button click for these question types.
    c. When auto-advance is active on a step, display a small helper text beneath the question (e.g. "Select an option to continue") so the respondent knows the form will move forward automatically.
    d. Questions that accept multiple selections (checkboxes, short_answer, paragraph, date, time) must still use an explicit "Next" button — do not auto-advance these.
    e. Pressing the Enter key on any step must advance the user to the next step (same as clicking "Next"). For steps with auto-advance (rule 12b), Enter should also trigger the advance. Exception: do not intercept Enter inside a <textarea> (paragraph questions) — allow normal line-break behaviour there.
    f. Every step after the first must include a "Back" button that returns the user to the previous step. The review page must also have a Back button. Only the very first question step should have no Back button.

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
- Do NOT include any images in the form. Do not use <img> tags, background-image CSS, or any external image URLs. The form should be styled with colors, gradients, and CSS only.`}

The form structure is:
${JSON.stringify(structure, null, 2)}

⚠️ REMINDER — Each question's "type" field above is AUTHORITATIVE. Here is a summary for quick reference:
${structure.questions.map((q, i) => `  ${i + 1}. "${q.text}" → type: ${q.type} (render as ${q.type === "checkboxes" ? "checkboxes (multiple selections allowed)" : q.type === "dropdown" ? "a <select> dropdown (single selection)" : q.type === "multiple_choice" ? "radio buttons (single selection)" : q.type})`).join("\n")}
Do NOT swap, change, or reinterpret any of these types.`;
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
  activeImages?: GeneratedImage[]
): Promise<{ html: string; images: GeneratedImage[] }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const genAI = new GoogleGenerativeAI(apiKey);

  // Build tools array — only include generate_image when images are enabled
  const tools: Tool[] = [];
  if (includeImages && imageGenerator) {
    tools.push({
      functionDeclarations: [generateImageFunctionDecl],
    });
  }

  const systemPrompt = buildSystemPrompt(structure, submitUrl, includeImages);
  if (LOG_FILE) {
    fs.writeFileSync(LOG_FILE, `=== Debug log started at ${new Date().toISOString()} ===\n`);
  }
  log("\n=== [GEMINI] SYSTEM PROMPT ===");
  log(systemPrompt);
  log("=== [GEMINI] END SYSTEM PROMPT ===\n");

  log("[GEMINI] Model:", MODEL_ID);
  log("[GEMINI] Include images:", includeImages);
  log("[GEMINI] Tools provided:", tools.length > 0 ? "generate_image" : "none");
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
      text: `Use the visual style of the image above as a reference.${focusText} Do not embed the image in the form.`,
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
  let response = await chat.sendMessage(parts);
  const generatedImages: GeneratedImage[] = [];

  // Function calling loop — Gemini may call generate_image zero or more times
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

    // Process all function calls — separate functionResponse parts from vision parts
    const functionResponses: Part[] = [];
    const visionFollowUp: Part[] = [];

    for (const part of functionCalls) {
      if (!("functionCall" in part) || !part.functionCall) continue;

      const { name, args } = part.functionCall;

      log(`[GEMINI] Function call: ${name}`);
      log(`[GEMINI] Args:`, JSON.stringify(args, null, 2));

      if (name === "generate_image" && imageGenerator) {
        try {
          log(`[GEMINI] >>> Calling image generator...`);
          const typedArgs = args as Record<string, string>;
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
          log(`[GEMINI] <<< Image generation FAILED: ${errorMsg}`);
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
      response = await chat.sendMessage(visionFollowUp);
    }
  }

  const text = response.response.text();

  const html = text
    .replace(/^```html\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

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

  return { html, images: generatedImages };
}
