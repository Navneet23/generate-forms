import { GoogleGenerativeAI, Part } from "@google/generative-ai";
import { FormStructure } from "./scraper";

const MODEL_ID = "gemini-3-flash-preview";

export interface HistoryTurn {
  role: "user" | "model";
  text: string;
}

export interface StyleGuide {
  imageBase64: string; // data:image/png;base64,... or raw base64
  focusNote: string;
}

function buildSystemPrompt(structure: FormStructure, submitUrl: string): string {
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
8. For required fields, add visible indication and client-side validation before submit.
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

export async function generateForm(
  structure: FormStructure,
  userPrompt: string,
  history: HistoryTurn[],
  previousHtml: string,
  submitUrl: string,
  screenshotBase64?: string,
  styleGuide?: StyleGuide
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: MODEL_ID,
    systemInstruction: buildSystemPrompt(structure, submitUrl),
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
  }

  // Screenshot of a selected region — shows the creator what to change
  if (screenshotBase64) {
    const { mimeType, data } = toInlineData(screenshotBase64);
    parts.push({ inlineData: { mimeType, data } });
    parts.push({
      text: "The image above is a screenshot of the region the creator wants to change.",
    });
  }

  // Main prompt text
  const promptText = previousHtml
    ? `Current form HTML:\n${previousHtml}\n\nCreator request: ${userPrompt}\n\nUpdate the form to fulfil this request. Return the complete updated HTML page.`
    : `Creator request: ${userPrompt}\n\nGenerate the complete HTML page for this form.`;

  parts.push({ text: promptText });

  const result = await chat.sendMessage(parts);
  const text = result.response.text();

  return text
    .replace(/^```html\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}
