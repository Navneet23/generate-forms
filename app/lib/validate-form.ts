import { FormStructure } from "./scraper";

/**
 * Post-generation groundedness & submit-wiring validator (QI-4 / QI-6).
 *
 * Deterministically validates generated HTML against the scraped FormStructure
 * and the submit contract. Pure function — no API calls, unit-testable.
 *
 * Severity semantics:
 *  - "error"   → groundedness/wiring violation worth a corrective retry
 *  - "warning" → statically unverifiable or minor; report, never retry
 *
 * Two-tier text matching: generated forms may legitimately build their DOM
 * from JS config arrays (SI layout rules allow it). Verbatim text found only
 * inside <script> strings is NOT drift — it is verbatim content in a
 * JS-rendered form — but wiring facts that exist only in scripts cannot be
 * statically proven, so those downgrade to warnings.
 */

export interface Violation {
  code:
    | "title_drift"
    | "description_drift"
    | "question_text_drift"
    | "option_drift"
    | "entry_missing"
    | "entry_script_only"
    | "input_type_mismatch"
    | "required_unverified"
    | "submit_wiring_missing"
    | "footer_missing"
    | "wordmark_missing";
  severity: "error" | "warning";
  message: string;
  expected?: string;
  found?: string;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] === "#") {
      const isHex = body[1] === "x" || body[1] === "X";
      const codePoint = parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10);
      if (Number.isNaN(codePoint)) return whole;
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return whole;
      }
    }
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body)
      ? NAMED_ENTITIES[body]
      : whole;
  });
}

function normalizeText(s: string): string {
  return decodeEntities(String(s ?? ""))
    .replace(/\s+/g, " ")
    .trim();
}

// Visible corpus: text nodes + attribute values, scripts/styles stripped.
// Option labels commonly live in value="..." attributes.
function buildCorpus(html: string): string {
  const withoutCode = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const textPart = normalizeText(withoutCode.replace(/<[^>]+>/g, " "));

  const attrValues: string[] = [];
  const attrRe = /=\s*"([^"]*)"|=\s*'([^']*)'/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(html)) !== null) {
    const v = m[1] !== undefined ? m[1] : m[2];
    if (v) attrValues.push(normalizeText(v));
  }
  return `${textPart}\n${attrValues.join("\n")}`;
}

// Script corpus: <script> contents with common JS string escapes undone.
function buildScriptCorpus(html: string): string {
  const scripts: string[] = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) scripts.push(m[1]);
  const unescaped = scripts
    .join("\n")
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\n|\\t/g, " ")
    .replace(/\\(["'`/\\])/g, "$1");
  return normalizeText(unescaped);
}

function findStaticEntryNames(html: string): Set<string> {
  const found = new Set<string>();
  const re = /name\s*=\s*["']entry\.(\d+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) found.add(`entry.${m[1]}`);
  return found;
}

// For a statically-named input, find the tag carrying that name and return
// its element/type so type mismatches (radio vs checkbox vs select) can be
// caught. Returns null when the name only exists in scripts.
function staticInputKind(html: string, entryId: string): { tag: string; type: string | null } | null {
  const nameEsc = entryId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tagRe = new RegExp(`<(input|select|textarea)\\b[^>]*name\\s*=\\s*["']${nameEsc}["'][^>]*>`, "i");
  const m = tagRe.exec(html);
  if (!m) return null;
  const typeMatch = /type\s*=\s*["']([^"']+)["']/i.exec(m[0]);
  return { tag: m[1].toLowerCase(), type: typeMatch ? typeMatch[1].toLowerCase() : null };
}

const EXPECTED_KIND: Record<string, (k: { tag: string; type: string | null }) => boolean> = {
  multiple_choice: (k) => (k.tag === "input" && k.type === "radio") || k.tag === "select",
  linear_scale: (k) => (k.tag === "input" && (k.type === "radio" || k.type === "range")) || k.tag === "select",
  checkboxes: (k) => k.tag === "input" && k.type === "checkbox",
  dropdown: (k) => k.tag === "select" || (k.tag === "input" && k.type === "radio"),
  short_answer: (k) => (k.tag === "input" && k.type !== "checkbox") || k.tag === "textarea",
  paragraph: (k) => k.tag === "textarea" || k.tag === "input",
  date: (k) => k.tag === "input",
  time: (k) => k.tag === "input",
};

export function validateGeneratedForm(
  html: string,
  structure: FormStructure,
  submitUrl: string
): Violation[] {
  const violations: Violation[] = [];
  const corpus = buildCorpus(html);
  const scriptCorpus = buildScriptCorpus(html);
  const staticNames = findStaticEntryNames(html);

  const textPresent = (text: string): "visible" | "script" | "missing" => {
    const norm = normalizeText(text);
    if (norm.length === 0) return "visible";
    if (corpus.includes(norm)) return "visible";
    if (scriptCorpus.includes(norm)) return "script";
    return "missing";
  };

  // 1. Title verbatim
  if (textPresent(structure.title) === "missing") {
    violations.push({
      code: "title_drift",
      severity: "error",
      message: `Form title must appear verbatim.`,
      expected: structure.title,
    });
  }

  // 1b. Description verbatim (when the source form has one)
  if (structure.description && textPresent(structure.description) === "missing") {
    violations.push({
      code: "description_drift",
      severity: "error",
      message: `Form description must appear verbatim.`,
      expected: structure.description,
    });
  }

  // Per-question checks (2, 3, 4, 5, 6, 9)
  structure.questions.forEach((q, i) => {
    const label = `Question ${i + 1}`;

    // 2/9. Question text verbatim (missing question surfaces here too)
    if (textPresent(q.text) === "missing") {
      violations.push({
        code: "question_text_drift",
        severity: "error",
        message: `${label} text must appear verbatim.`,
        expected: q.text,
      });
    }

    // 3. Option labels verbatim
    for (const opt of q.options) {
      if (textPresent(opt) === "missing") {
        violations.push({
          code: "option_drift",
          severity: "error",
          message: `${label} option must appear verbatim.`,
          expected: opt,
        });
      }
    }

    // 4. Entry name present (QI-6 submit routing)
    if (staticNames.has(q.entryId)) {
      // 5. Input type matches question type (only provable for static inputs)
      const kind = staticInputKind(html, q.entryId);
      const expect = EXPECTED_KIND[q.type];
      if (kind && expect && !expect(kind)) {
        violations.push({
          code: "input_type_mismatch",
          severity: "error",
          message: `${label} (${q.type}) uses <${kind.tag}${kind.type ? ` type="${kind.type}"` : ""}> — wrong input kind for this question type.`,
          expected: q.type,
          found: `${kind.tag}${kind.type ? `[type=${kind.type}]` : ""}`,
        });
      }
    } else if (html.includes(q.entryId)) {
      violations.push({
        code: "entry_script_only",
        severity: "warning",
        message: `${label} entry name ${q.entryId} appears only inside scripts (JS-rendered form) — submit wiring not statically verifiable.`,
        expected: q.entryId,
      });
    } else {
      violations.push({
        code: "entry_missing",
        severity: "error",
        message: `${label} entry name ${q.entryId} is missing — its answer cannot reach the Google Form.`,
        expected: q.entryId,
      });
    }

    // 6. Required flag — statically inconclusive either way (SI allows JS
    // validation), so absence is a warning, never a retry trigger.
    if (q.required && staticNames.has(q.entryId)) {
      const nameEsc = q.entryId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const nearRequired = new RegExp(
        `name\\s*=\\s*["']${nameEsc}["'][^>]*\\brequired\\b|\\brequired\\b[^>]*name\\s*=\\s*["']${nameEsc}["']`,
        "i"
      );
      if (!nearRequired.test(html) && !scriptCorpus.includes(q.entryId)) {
        violations.push({
          code: "required_unverified",
          severity: "warning",
          message: `${label} is required in the source form but no required attribute or JS reference was found for ${q.entryId}.`,
          expected: q.entryId,
        });
      }
    }
  });

  // 7. Submit wiring: a fetch POST to the proxy URL must exist in the page.
  if (!html.includes(submitUrl)) {
    violations.push({
      code: "submit_wiring_missing",
      severity: "error",
      message: `The submit URL is missing — the form cannot submit.`,
      expected: submitUrl,
    });
  }

  // 8. Footer marker (QI-1) and wordmark (QI-2)
  if (!html.includes("data-gforms-footer")) {
    violations.push({
      code: "footer_missing",
      severity: "error",
      message: `The canonical Google Forms footer (data-gforms-footer) is missing.`,
      expected: "data-gforms-footer",
    });
  } else if (!/aria-label\s*=\s*["']Google Forms["']/i.test(html)) {
    violations.push({
      code: "wordmark_missing",
      severity: "warning",
      message: `Footer present but the "Google Forms" wordmark element was not found.`,
      expected: 'aria-label="Google Forms"',
    });
  }

  return violations;
}

/** Errors only — the subset that justifies a corrective retry. */
export function validationErrors(violations: Violation[]): Violation[] {
  return violations.filter((v) => v.severity === "error");
}

/**
 * Builds the corrective follow-up message sent back to Gemini when the
 * generated HTML fails validation. Lists each violation precisely so the
 * model can fix without guessing.
 */
export function buildCorrectionPrompt(violations: Violation[]): string {
  const lines = validationErrors(violations).map((v) => {
    let line = `- ${v.message}`;
    if (v.expected) line += ` Required exact text/value: "${v.expected}"`;
    if (v.found) line += ` (you rendered: "${v.found}")`;
    return line;
  });
  return [
    "Your generated HTML failed automatic validation against the original form. " +
      "Fix ONLY the issues listed below and return the complete corrected HTML document. " +
      "Do not change anything else — keep the design, layout, images, and all other content exactly as they are. " +
      "Question text, option labels, title, description, and entry.* names must match the original form VERBATIM, character for character.",
    "",
    "Violations:",
    ...lines,
    "",
    "Return the full corrected HTML document only — no markdown, no explanations.",
  ].join("\n");
}
