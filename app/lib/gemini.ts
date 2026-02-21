import { GoogleGenerativeAI } from "@google/generative-ai";
import { FormStructure } from "./scraper";

const MODEL_ID = "gemini-2.0-flash";

export interface HistoryTurn {
  role: "user" | "model";
  text: string;
}

function buildSystemPrompt(structure: FormStructure, submitUrl: string): string {
  return `You are an expert frontend developer who specialises in building beautiful, custom HTML forms.

You will be given a Google Form structure and a styling request. Your job is to output a COMPLETE, SELF-CONTAINED HTML page that renders the form with the requested visual design.

RULES — you must follow all of these:
1. Output ONLY raw HTML. No markdown, no code fences, no explanation. The very first character of your response must be "<" and the last must be ">".
2. All CSS must be inline in a <style> tag inside <head>. No external stylesheets.
3. All JavaScript must be inline in a <script> tag. No external scripts.
4. Every form input must use the exact name attribute provided (e.g. name="entry.1234567890"). These are critical for routing responses correctly.
5. The form must submit via JavaScript fetch POST to: ${submitUrl}
   Send JSON body: an object mapping each entry.XXXXXXXXX name to its value.
   On success show a thank-you message. On error show a friendly error message.
   If you generate a multi-step form, collect ALL field values across ALL steps before submitting — never submit with missing or empty values from earlier steps.
6. The form must be fully responsive and work on mobile.
7. Render ALL questions from the structure in order. Do not skip any. Always render the form title and description at the top.
8. For required fields, add visible indication and client-side validation before submit.
9. For linear_scale questions, render them as a single horizontal row of numbered radio buttons. The min label appears below the lowest number and the max label appears below the highest number. Labels and numbers must be aligned in one clean row — never stack them vertically or misalign them.
10. If generating a multi-step form with a review page, the review page must display the actual values the user entered, not placeholder text like "No answer provided".

The form structure is:
${JSON.stringify(structure, null, 2)}`;
}

export async function generateForm(
  structure: FormStructure,
  userPrompt: string,
  history: HistoryTurn[],
  previousHtml: string,
  submitUrl: string
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: MODEL_ID,
    systemInstruction: buildSystemPrompt(structure, submitUrl),
  });

  // Build history for the chat (max last 10 turns)
  const recentHistory = history.slice(-10);

  const chat = model.startChat({
    history: recentHistory.map((turn) => ({
      role: turn.role,
      parts: [{ text: turn.text }],
    })),
  });

  const fullPrompt = previousHtml
    ? `Current form HTML:\n${previousHtml}\n\nCreator request: ${userPrompt}\n\nUpdate the form to fulfil this request. Return the complete updated HTML page.`
    : `Creator request: ${userPrompt}\n\nGenerate the complete HTML page for this form.`;

  const result = await chat.sendMessage(fullPrompt);
  const text = result.response.text();

  // Strip accidental markdown code fences
  return text
    .replace(/^```html\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}
