#!/usr/bin/env node
// check-submit-wiring.mjs — static check of a generated form's submit wiring:
// where does it POST, does that target match the expected Google Form, and
// is there code-level evidence that checkbox groups are sent as arrays.
//
// Usage:
//   node .claude/skills/forms-restyler-analysis-toolkit/scripts/check-submit-wiring.mjs \
//        <generated-form-url-or-html-file> [expected-google-form-url-or-form-id]
//
// The second argument is optional. If given, it is compared against the
// formId found in the submit target. If omitted, the script only reports
// what it found (no PASS/FAIL comparison).
//
// Exit codes: 0 = no problems found among what CAN be statically checked,
// 1 = a check failed (no submit target found, or formId mismatch) or a
// usage error.
//
// Node >=20, ESM, stdlib + global fetch only. No npm dependencies.
//
// WHAT THIS SCRIPT CANNOT DO (read before trusting a green result):
// It never executes JavaScript. It greps the generated HTML's <script>
// blocks and attributes with regexes. It can tell you the code CONTAINS
// patterns consistent with correct behaviour; it cannot tell you the code
// actually RUNS correctly at submit time (e.g. a fetch() call that's dead
// code, or a checkbox array branch guarded by a key typo, would still look
// "wired" to this script). For a behavioural guarantee you need an actual
// submission — see the "End-to-end submission verification" recipe in
// SKILL.md.

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

async function readInput(pathOrUrl) {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    const res = await fetch(pathOrUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; FormRestylerSubmitCheck/1.0)" },
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

function extractExpectedFormId(arg) {
  if (!arg) return null;
  const m = arg.match(/\/forms\/d\/e\/([^/]+)\//);
  if (m) return m[1];
  // Bare form id (Google Form ids are typically 1FAIpQLS... or similar
  // alnum/underscore/hyphen strings with no slashes).
  if (/^[A-Za-z0-9_-]+$/.test(arg)) return arg;
  throw new Error(`Could not extract a form id from "${arg}".`);
}

function extractScriptBlobs(html) {
  const blocks = [];
  const re = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    // Skip JSON-LD / non-JS script tags.
    if (/type\s*=\s*["'](application\/(ld\+)?json)["']/i.test(m[0])) continue;
    blocks.push(m[1]);
  }
  return blocks;
}

function findSubmitTargets(scriptBlob) {
  // Matches fetch("...api/submit/<formId>...") with either quote style, and
  // tolerates a template literal too (won't resolve interpolation — flagged
  // separately below).
  const targets = [];
  const re = /\/api\/submit\/([A-Za-z0-9_-]+)/g;
  let m;
  while ((m = re.exec(scriptBlob)) !== null) {
    targets.push(m[1]);
  }
  return [...new Set(targets)];
}

function findCheckboxGroups(html) {
  const groups = new Map(); // name -> count of checkbox inputs
  const re = /<input\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    if (!/type\s*=\s*["']checkbox["']/i.test(tag)) continue;
    const nameMatch = tag.match(/name\s*=\s*["']([^"']+)["']/i);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    groups.set(name, (groups.get(name) ?? 0) + 1);
  }
  return groups;
}

function checkArrayHandling(scriptBlob, entryName) {
  // Heuristic only (see file header). Looks for the entry name appearing in
  // the same script blob as one of the common "send this key as an array"
  // patterns actually seen in this codebase's generated output:
  //   data[key] = formData.getAll(key)
  //   formData.getAll('entry.NNN')
  //   Array.from(...).join(...)  (used for review-page display, not proof of
  //     submit-time array handling on its own — treated as weak evidence)
  const nameEsc = entryName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nameLiteral = new RegExp(`["']${nameEsc}["']`);
  if (!nameLiteral.test(scriptBlob)) {
    return { verified: false, reason: "entry name not found as a string literal in any <script> block" };
  }
  const strongPattern = new RegExp(`getAll\\s*\\(\\s*[^)]*${nameEsc}|${nameEsc}[^;]*getAll\\s*\\(`);
  if (strongPattern.test(scriptBlob)) {
    return { verified: true, reason: "getAll( ) used in a branch referencing this entry name" };
  }
  const genericGetAll = /\.getAll\s*\(/.test(scriptBlob);
  if (genericGetAll) {
    return {
      verified: "weak",
      reason: "script uses formData.getAll(...) somewhere, and this entry name appears in a <script> block, but the two are not adjacent enough to confirm they're linked — inspect manually",
    };
  }
  return { verified: false, reason: "no getAll(...) / array-sending pattern found anywhere in scripts, despite multiple checkboxes sharing this name" };
}

function usage() {
  console.error(
    "Usage: node check-submit-wiring.mjs <generated-form-url-or-html-file> [expected-google-form-url-or-form-id]"
  );
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1 || args.length > 2) {
    usage();
    process.exit(2);
  }
  const [inputArg, expectedArg] = args;

  const html = await readInput(inputArg);
  const scriptBlocks = extractScriptBlobs(html);
  const scriptBlob = scriptBlocks.join("\n");

  let ok = true;
  console.log(`=== submit wiring check: ${inputArg} ===`);

  // 1. Submit target
  const targets = findSubmitTargets(scriptBlob);
  if (targets.length === 0) {
    console.log('[DRIFT] submit target — no fetch("/api/submit/<formId>") pattern found in any <script> block');
    ok = false;
  } else if (targets.length > 1) {
    console.log(`[WARN ] submit target — found ${targets.length} distinct /api/submit/<id> targets (expected exactly 1): ${targets.join(", ")}`);
  } else {
    console.log(`[OK   ] submit target — found /api/submit/${targets[0]}`);
  }

  // 2. formId match (only if expected arg given)
  let expectedFormId = null;
  try {
    expectedFormId = extractExpectedFormId(expectedArg);
  } catch (e) {
    console.log(`[WARN ] expected-form-id — ${e.message}`);
  }
  if (expectedFormId) {
    if (targets.includes(expectedFormId)) {
      console.log(`[OK   ] formId match — submit target includes expected id ${expectedFormId}`);
    } else {
      console.log(
        `[DRIFT] formId match — expected ${expectedFormId}, found ${targets.length ? targets.join(", ") : "(none)"}`
      );
      ok = false;
    }
  } else {
    console.log("[INFO ] formId match — no expected form id/url given; skipped (pass it as arg 2 to check)");
  }

  // 3. Checkbox array handling (heuristic — see file header)
  const groups = findCheckboxGroups(html);
  const multiCheckboxGroups = [...groups.entries()].filter(([, count]) => count > 1);
  if (multiCheckboxGroups.length === 0) {
    console.log("[INFO ] checkbox array handling — no checkbox question with >1 option found; nothing to check");
  } else {
    for (const [name] of multiCheckboxGroups) {
      const result = checkArrayHandling(scriptBlob, name);
      const status = result.verified === true ? "OK   " : result.verified === "weak" ? "WARN " : "DRIFT";
      console.log(`[${status}] checkbox array handling (${name}) — ${result.reason}`);
      if (result.verified === false) ok = false;
    }
  }

  console.log(`\n${ok ? "OK" : "FAIL"}: static checks ${ok ? "passed" : "found problems"}. This does NOT execute the page — see file header for limits.`);
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});
