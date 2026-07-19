#!/usr/bin/env node
// check-drift.mjs — cross-reference a generated (restyled) form's HTML against
// the ground-truth Google Form it was built from, and report every place the
// generated content diverges from the source ("drift").
//
// Usage:
//   node .claude/skills/forms-restyler-analysis-toolkit/scripts/check-drift.mjs \
//        <generated-form-url-or-html-file> <google-form-responder-url>
//
//   node .claude/skills/forms-restyler-analysis-toolkit/scripts/check-drift.mjs --self-test
//   node .claude/skills/forms-restyler-analysis-toolkit/scripts/check-drift.mjs --self-test \
//        <generated-form-url-or-html-file> <google-form-responder-url>
//
// Exit codes: 0 = no drift found (or self-test PASS), 1 = drift found (or
// self-test FAIL / usage error).
//
// Node >=20, ESM, stdlib + global fetch only. No npm dependencies.

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

// ---------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------

async function readInput(pathOrUrl) {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    const res = await fetch(pathOrUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; FormRestylerDriftCheck/1.0)" },
    });
    if (!res.ok) {
      throw new Error(`Fetch failed for ${pathOrUrl}: ${res.status} ${res.statusText}`);
    }
    return res.text();
  }
  if (!existsSync(pathOrUrl)) {
    throw new Error(`Not a URL and no such file: ${pathOrUrl}`);
  }
  return readFile(pathOrUrl, "utf8");
}

// ---------------------------------------------------------------------------
// Ground-truth extraction: FB_PUBLIC_LOAD_DATA_ walker.
// This is a faithful port of the bracket-depth walker + index map in
// app/lib/scraper.ts (normalise()). Keep the two in sync if scraper.ts changes.
//   raw[1][8]        -> title
//   raw[1][0]        -> description
//   raw[1][1]        -> questions array
//   q[1]             -> question text
//   q[3]             -> type code (see TYPE_MAP)
//   q[4][0][0]       -> entry id (numeric, becomes "entry.<id>")
//   q[4][0][1]       -> options array, each option is [label, ...]
//   q[4][0][2]       -> required (1 = required)
// ---------------------------------------------------------------------------

const TYPE_MAP = {
  0: "short_answer",
  1: "paragraph",
  2: "multiple_choice",
  3: "dropdown",
  4: "checkboxes",
  5: "linear_scale",
  9: "date",
  10: "time",
};

function extractRawLoadData(html) {
  const marker = "FB_PUBLIC_LOAD_DATA_ = ";
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error(
      "Could not find FB_PUBLIC_LOAD_DATA_ in the responder page. Make sure the form is public and the URL is a live Google Form viewform URL."
    );
  }
  const jsonStart = markerIndex + marker.length;
  let depth = 0;
  let jsonEnd = -1;
  for (let i = jsonStart; i < html.length; i++) {
    if (html[i] === "[") depth++;
    else if (html[i] === "]") {
      depth--;
      if (depth === 0) {
        jsonEnd = i + 1;
        break;
      }
    }
  }
  if (jsonEnd === -1) throw new Error("Failed to extract FB_PUBLIC_LOAD_DATA_ (unbalanced brackets).");
  try {
    return JSON.parse(html.slice(jsonStart, jsonEnd));
  } catch (e) {
    throw new Error(`Failed to JSON.parse FB_PUBLIC_LOAD_DATA_: ${e.message}`);
  }
}

function formIdFromResponderUrl(url) {
  const m = url.match(/\/forms\/d\/e\/([^/]+)\//);
  if (!m) {
    throw new Error(
      `Could not extract a form id from "${url}". Expected a .../forms/d/e/<id>/viewform URL.`
    );
  }
  return m[1];
}

function extractStructure(responderHtml, responderUrl) {
  const raw = extractRawLoadData(responderHtml);
  const formId = formIdFromResponderUrl(responderUrl);
  const meta = raw?.[1];
  const title = meta?.[8] ?? "Untitled Form";
  const description = meta?.[0] ?? "";
  const rawQuestions = meta?.[1] ?? [];

  const questions = [];
  for (const q of rawQuestions) {
    const text = q?.[1] ?? "";
    const typeCode = q?.[3] ?? -1;
    const type = TYPE_MAP[typeCode] ?? "unknown";
    if (type === "unknown") continue; // scraper.ts skips these too

    const answerDef = q?.[4]?.[0] ?? [];
    const entryId = `entry.${answerDef?.[0] ?? ""}`;
    const required = q?.[4]?.[0]?.[2] === 1;
    const rawOptions = answerDef?.[1] ?? [];
    const options = rawOptions.map((o) => o?.[0] ?? "");

    questions.push({ text, type, entryId, required, options });
  }

  return { formId, title, description, questions };
}

// ---------------------------------------------------------------------------
// Normalization — applied to BOTH the ground-truth strings and the generated
// HTML's extracted text before comparison. Documented exactly so a false
// DRIFT can be triaged: is it real drift, or a normalization gap?
//
//   1. Decode a fixed set of HTML entities: &amp; &lt; &gt; &quot; &apos;
//      &#39; &nbsp; (-> space), plus numeric entities &#NNN; and &#xHH;.
//   2. Collapse ALL whitespace runs (space, tab, newline, decoded &nbsp;) to
//      a single space.
//   3. Trim leading/trailing whitespace.
//
// NOT normalized: case, curly vs straight quotes ('vs’), em/en dashes,
// trailing punctuation. A generated form that renders "Don't" as "Don't"
// (curly apostrophe) WILL show as DRIFT here — that is a real, if cosmetic,
// verbatim-text violation per the SI's "character-for-character" rule, so it
// is intentionally not suppressed. If you need looser matching for triage,
// do it by eye on the printed expected/actual pair.
// ---------------------------------------------------------------------------

const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(s) {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body) => {
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
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body) ? NAMED_ENTITIES[body] : whole;
  });
}

function normalizeText(s) {
  return decodeEntities(String(s ?? ""))
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Generated-HTML corpus extraction.
// Builds a searchable text blob from the generated HTML: visible text nodes
// PLUS attribute values (value=, placeholder=, aria-label=), because option
// labels commonly live in value="..." on <input type="radio"/"checkbox">
// rather than in a text node, and select options can go either way.
// ---------------------------------------------------------------------------

function stripScriptsAndStyles(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
}

function buildCorpus(html) {
  const withoutCode = stripScriptsAndStyles(html);
  const textPart = normalizeText(withoutCode.replace(/<[^>]+>/g, " "));

  const attrValues = [];
  const attrRe = /=\s*"([^"]*)"|=\s*'([^']*)'/g;
  let m;
  while ((m = attrRe.exec(html)) !== null) {
    const v = m[1] !== undefined ? m[1] : m[2];
    if (v) attrValues.push(normalizeText(v));
  }

  return `${textPart}\n${attrValues.join("\n")}`;
}

function findEntryNames(html) {
  const found = new Set();
  const re = /name\s*=\s*["']entry\.(\d+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    found.add(`entry.${m[1]}`);
  }
  return found;
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

function runChecks(structure, generatedHtml) {
  const corpus = buildCorpus(generatedHtml);
  const entryNames = findEntryNames(generatedHtml);
  const checks = [];

  const push = (status, label, detail) => checks.push({ status, label, detail });

  // Title
  const normTitle = normalizeText(structure.title);
  push(
    corpus.includes(normTitle) ? "OK" : "DRIFT",
    "title",
    `expected "${structure.title}"`
  );

  // Description (may legitimately be empty on some forms — treat empty as OK/skip)
  const normDesc = normalizeText(structure.description);
  if (normDesc.length > 0) {
    push(
      corpus.includes(normDesc) ? "OK" : "DRIFT",
      "description",
      `expected "${structure.description}"`
    );
  } else {
    push("OK", "description", "(source form has no description; nothing to check)");
  }

  // Footer marker
  push(
    generatedHtml.includes("data-gforms-footer") ? "OK" : "DRIFT",
    "footer marker",
    'expected the data-gforms-footer attribute (see buildGoogleFormsFooter() in app/lib/gemini.ts)'
  );

  // Per-question checks
  structure.questions.forEach((q, i) => {
    const qLabel = `question ${i + 1}`;
    const normQ = normalizeText(q.text);
    push(
      corpus.includes(normQ) ? "OK" : "DRIFT",
      `${qLabel} text`,
      `expected "${q.text}"`
    );

    push(
      entryNames.has(q.entryId) ? "OK" : "DRIFT",
      `${qLabel} entry id`,
      `expected name="${q.entryId}" on an input/select/textarea`
    );

    q.options.forEach((opt, j) => {
      const normOpt = normalizeText(opt);
      if (normOpt.length === 0) return;
      push(
        corpus.includes(normOpt) ? "OK" : "DRIFT",
        `${qLabel} option ${j + 1}`,
        `expected "${opt}"`
      );
    });

    // Best-effort, non-blocking: does a required question actually carry a
    // required marker near its entry id? This is a WARN, not a DRIFT — it
    // does not affect the exit code — because "required" can legitimately be
    // enforced in JS validateStep() rather than via an HTML `required`
    // attribute (the SI allows either), so a static regex cannot fully
    // verify it either way.
    if (q.required) {
      const nameEsc = q.entryId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const nearRequired = new RegExp(
        `name\\s*=\\s*["']${nameEsc}["'][^>]*\\brequired\\b|\\brequired\\b[^>]*name\\s*=\\s*["']${nameEsc}["']`,
        "i"
      );
      if (!nearRequired.test(generatedHtml)) {
        push(
          "WARN",
          `${qLabel} required flag`,
          `structure marks this required; no HTML "required" attribute found on ${q.entryId} (may be enforced in JS instead — not conclusive)`
        );
      }
    }
  });

  const driftCount = checks.filter((c) => c.status === "DRIFT").length;
  const warnCount = checks.filter((c) => c.status === "WARN").length;
  return { checks, driftCount, warnCount };
}

function printReport(title, result) {
  console.log(`\n=== ${title} ===`);
  for (const c of result.checks) {
    console.log(`[${c.status.padEnd(5)}] ${c.label} — ${c.detail}`);
  }
  console.log(
    `SUMMARY: ${result.checks.length - result.driftCount - result.warnCount} OK, ${result.driftCount} DRIFT, ${result.warnCount} WARN`
  );
}

// ---------------------------------------------------------------------------
// Self-test: fetch a real generated/source pair, mutate one question's text
// in memory (never on disk — this skill is read-only outside its own dir),
// and confirm the mutation is caught as DRIFT. Proves the checker isn't
// vacuously passing everything.
// ---------------------------------------------------------------------------

const DEFAULT_PAIR = {
  // atelier-eva-tattoo, config gemini-2.5-flash-image — verified reachable
  // 2026-07-19. Blob TTL ~1 year from generation (expiresAt ~2027-07-18 per
  // evals/manifest-items/atelier-eva-tattoo.json). If this 404s later, pass
  // a live pair explicitly: --self-test <generated-url> <responder-url>.
  generated: "https://app-red-phi-88.vercel.app/f/5aYZce4U-t",
  responder:
    "https://docs.google.com/forms/d/e/1FAIpQLSdkD3Q8D_r3p152ZoXYh8ZgqDKMwKuRtNrEp2zKUPaYi8m6Xw/viewform",
};

async function selfTest(genArg, respArg) {
  const generatedUrl = genArg || DEFAULT_PAIR.generated;
  const responderUrl = respArg || DEFAULT_PAIR.responder;

  console.log(`Self-test pair:\n  generated: ${generatedUrl}\n  responder: ${responderUrl}`);

  const [generatedHtml, responderHtml] = await Promise.all([
    readInput(generatedUrl),
    readInput(responderUrl),
  ]);

  const structure = extractStructure(responderHtml, responderUrl);
  if (structure.questions.length === 0) {
    console.error("SELF-TEST FAIL: extracted zero questions from the responder page — cannot mutate anything.");
    process.exit(1);
  }

  const baseline = runChecks(structure, generatedHtml);
  printReport("baseline (unmutated) — informational, real drift may legitimately show here", baseline);

  const mutationSuffix = " §SELF-TEST-MUTATION§";
  const targetIndex = 0;
  const mutated = {
    ...structure,
    questions: structure.questions.map((q, i) =>
      i === targetIndex ? { ...q, text: q.text + mutationSuffix } : q
    ),
  };
  console.log(
    `\nMutating question 1 text: "${structure.questions[0].text}" -> "${mutated.questions[0].text}"`
  );

  const mutatedResult = runChecks(mutated, generatedHtml);
  printReport("after mutation", mutatedResult);

  const targetCheck = mutatedResult.checks.find((c) => c.label === "question 1 text");
  const caught = targetCheck && targetCheck.status === "DRIFT";

  console.log(`\nSELF-TEST ${caught ? "PASS" : "FAIL"}: mutated question text ${caught ? "was" : "was NOT"} flagged as DRIFT.`);
  process.exit(caught ? 0 : 1);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function usage() {
  console.error(
    [
      "Usage:",
      "  node check-drift.mjs <generated-form-url-or-html-file> <google-form-responder-url>",
      "  node check-drift.mjs --self-test [<generated-form-url-or-html-file> <google-form-responder-url>]",
    ].join("\n")
  );
}

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === "--self-test") {
    await selfTest(args[1], args[2]);
    return;
  }

  if (args.length !== 2) {
    usage();
    process.exit(2);
  }

  const [generatedArg, responderArg] = args;
  const [generatedHtml, responderHtml] = await Promise.all([
    readInput(generatedArg),
    readInput(responderArg),
  ]);

  const structure = extractStructure(responderHtml, responderArg);
  const result = runChecks(structure, generatedHtml);
  printReport(`drift check: ${generatedArg} vs ${responderArg}`, result);

  if (result.driftCount > 0) {
    console.error(`\nFAIL: ${result.driftCount} drift check(s) failed.`);
    process.exit(1);
  }
  console.log("\nOK: no drift detected.");
  process.exit(0);
}

main().catch((err) => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});
