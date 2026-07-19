// Stage 2: Gemini turns extracted text into a question list constrained to the
// 8 supported types ("similar, not exact" — unsupported types mapped or skipped).
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getGeminiApiKey } from "./env.mjs";

const MODEL_ID = "gemini-3-flash-preview";
const SUPPORTED_TYPES = [
  "short_answer",
  "paragraph",
  "multiple_choice",
  "checkboxes",
  "dropdown",
  "linear_scale",
  "date",
  "time",
];

const SYSTEM = `You recreate online forms as Google Forms for an evaluation dataset.
Given text extracted from a real form (plus metadata), output the form as JSON:

{
  "title": string,
  "description": string,          // 1-2 sentences, faithful to the form's intro if present
  "questions": [
    {
      "text": string,
      "type": "short_answer" | "paragraph" | "multiple_choice" | "checkboxes" | "dropdown" | "linear_scale" | "date" | "time",
      "required": boolean,
      "options": [string],        // multiple_choice / checkboxes / dropdown only
      "low": int, "high": int,    // linear_scale only (e.g. 1, 5)
      "lowLabel": string, "highLabel": string  // linear_scale only, may be ""
    }
  ]
}

Rules:
- ONLY the 8 types listed. Map unsupported question kinds to the closest type:
  email/phone/website/number → short_answer; rating/NPS/stars/emoji scale → linear_scale;
  yes-no / consent → multiple_choice with ["Yes","No"] (or the original labels);
  matrix/Likert grid → one linear_scale or multiple_choice question per row (cap at 4 rows).
- SKIP entirely: payment/credit-card fields, file uploads, signatures, scheduling widgets.
- Preserve the original question wording and option labels wherever they are visible in the text.
- The extracted text may contain navigation, cookie banners, or marketing copy — ignore it.
- If the text does not reveal the full question list (single-question-at-a-time forms),
  infer a plausible, realistic question set for this form's stated business purpose.
- 5 to 15 questions total. Mark questions required only when the source clearly does.
- Output ONLY the JSON object. No markdown fences, no commentary.`;

export async function recreateStructure(source, extraction) {
  const genAI = new GoogleGenerativeAI(getGeminiApiKey());
  const model = genAI.getGenerativeModel({ model: MODEL_ID, systemInstruction: SYSTEM });

  const prompt = [
    `Form metadata: business="${source.business}", industry="${source.industry}", form type="${source.formType}", built with ${source.product}.`,
    extraction.thinExtraction
      ? "NOTE: extraction was thin — the text below may only show part of the form. Infer the rest from the metadata."
      : "",
    `--- RENDERED PAGE TEXT ---\n${extraction.text}`,
    extraction.jsonState ? `--- EMBEDDED PAGE JSON (may contain the full field list) ---\n${extraction.jsonState}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await model.generateContent(prompt);
  const raw = result.response
    .text()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let structure;
  try {
    structure = JSON.parse(raw);
  } catch {
    throw new Error(`Gemini returned unparseable JSON (first 200 chars): ${raw.slice(0, 200)}`);
  }
  validateStructure(structure);
  return structure;
}

function validateStructure(s) {
  if (!s.title || typeof s.title !== "string") throw new Error("structure missing title");
  if (!Array.isArray(s.questions) || s.questions.length === 0)
    throw new Error("structure has no questions");
  for (const q of s.questions) {
    // Gemini sometimes emits consent/acknowledgement items as a 1-option
    // multiple_choice or dropdown — coerce to checkboxes, where 1 option is legal.
    if (["multiple_choice", "dropdown"].includes(q.type) && Array.isArray(q.options) && q.options.length === 1) {
      q.type = "checkboxes";
    }
  }
  for (const [i, q] of s.questions.entries()) {
    if (!q.text) throw new Error(`question ${i + 1} missing text`);
    if (!SUPPORTED_TYPES.includes(q.type))
      throw new Error(`question ${i + 1} has unsupported type "${q.type}"`);
    if (["multiple_choice", "checkboxes", "dropdown"].includes(q.type)) {
      // checkboxes may legitimately have a single option (consent-style items)
      const min = q.type === "checkboxes" ? 1 : 2;
      if (!Array.isArray(q.options) || q.options.length < min)
        throw new Error(`question ${i + 1} (${q.type}) needs >= ${min} options`);
    }
    if (q.type === "linear_scale") {
      if (!Number.isInteger(q.low) || !Number.isInteger(q.high) || q.low >= q.high)
        throw new Error(`question ${i + 1} (linear_scale) needs integer low < high`);
    }
  }
}
