#!/usr/bin/env node
// contrast-check.mjs — parse the inline <style> CSS of a generated form and
// compute WCAG relative-luminance contrast ratios for body/container-level
// color + background-color (or background) pairs.
//
// Usage:
//   node .claude/skills/forms-restyler-analysis-toolkit/scripts/contrast-check.mjs \
//        <generated-form-url-or-html-file>
//
// Exit codes: 0 = every computable pair meets its threshold, 1 = at least
// one computable pair fails, or a usage/fetch error.
//
// Interpretation guide (SI rule 16 / rater_instructions.md):
//   body text    needs ratio >= 4.5:1
//   large text   needs ratio >= 3:1   (this script cannot tell font-size
//                from a CSS rule alone in every case — it prints the ratio
//                and BOTH thresholds; you decide which applies per selector)
//
// WHAT THIS SCRIPT CANNOT DO (read before trusting a green OR red result):
//   - Gradients, background images (url(...)), and box-shadow "glow" text
//     treatments are NOT checkable statically. Any rule using a gradient or
//     url() background is reported as UNCHECKABLE, not PASS or FAIL — go
//     look at it with your eyes (see the mobile-viewport recipe in
//     SKILL.md; same rendering approach applies here).
//   - No cascade resolution. A rule that sets `color` but not
//     `background-color` gets the nearest declared `body { background-color
//     }` as an ASSUMED fallback, clearly labeled as such — this is NOT real
//     CSS cascade/specificity resolution, just a convenience heuristic for
//     the single most common case (text color set on a child, background
//     set on body/html).
//   - Alpha channels in rgba()/hsla() are ignored (treated as fully
//     opaque). A translucent overlay's TRUE contrast against whatever is
//     behind it cannot be computed without knowing that layer — flagged
//     inline as "(alpha ignored)".
//   - Only a modest set of CSS color formats are parsed: #rgb, #rgba,
//     #rrggbb, #rrggbbaa, rgb()/rgba(), and a small set of common named
//     colors (see NAMED_COLORS below). hsl()/hsla()/lab()/oklch() etc. are
//     reported as UNPARSEABLE.
//   - CSS variables (var(--x)) are resolved ONE level against a `:root {
//     }` block if present, with fallback values (var(--x, #fff)) honored
//     when the variable itself isn't found. Variables that reference other
//     variables are resolved up to 3 passes; deeper chains may not resolve.
//
// Node >=20, ESM, stdlib only (no fetch needed for parsing, but readInput
// uses global fetch for URL inputs). No npm dependencies.

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

async function readInput(pathOrUrl) {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    const res = await fetch(pathOrUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; FormRestylerContrastCheck/1.0)" },
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
// CSS rule extraction: brace-depth scanner that yields every INNERMOST rule
// (selector, declarationText), correctly skipping @media/@supports wrapper
// blocks (their own "body" is discarded; the rules nested inside them are
// still emitted individually as they close).
// ---------------------------------------------------------------------------

function extractStyleBlocks(html) {
  const blocks = [];
  const re = /<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = re.exec(html)) !== null) blocks.push(m[1]);
  return blocks;
}

function parseRules(css) {
  // Strip comments first so they can't confuse brace counting.
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [];
  const stack = [];
  let buffer = "";
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === ";" && stack.length === 0) {
      // Top-level statement terminated by ';' with no block, e.g.
      // @import url(...); or @charset "UTF-8"; — discard it so it doesn't
      // get glued onto the next real selector's buffer.
      buffer = "";
    } else if (ch === "{") {
      stack.push(buffer.trim());
      buffer = "";
    } else if (ch === "}") {
      const body = buffer.trim();
      buffer = "";
      const selector = stack.pop();
      if (selector !== undefined && !selector.startsWith("@")) {
        rules.push({ selector, body });
      }
      // if selector starts with @ (e.g. @media (...)), its "body" here is
      // just leftover whitespace between nested rules — discard, the nested
      // rules were already pushed individually as they closed.
    } else {
      buffer += ch;
    }
  }
  return rules;
}

// ---------------------------------------------------------------------------
// :root variable resolution
// ---------------------------------------------------------------------------

function buildVariableMap(rules) {
  const vars = {};
  for (const rule of rules) {
    if (!/(^|,)\s*:root\s*($|,)/.test(rule.selector) && rule.selector.trim() !== "html") continue;
    const declRe = /(--[a-zA-Z0-9-_]+)\s*:\s*([^;]+);?/g;
    let m;
    while ((m = declRe.exec(rule.body)) !== null) {
      vars[m[1]] = m[2].trim();
    }
  }
  return vars;
}

function resolveVars(value, vars, depth = 0) {
  if (depth > 3) return value;
  const varRe = /var\(\s*(--[a-zA-Z0-9-_]+)\s*(?:,\s*([^)]+))?\)/;
  const m = value.match(varRe);
  if (!m) return value;
  const [whole, name, fallback] = m;
  const resolved = vars[name] !== undefined ? vars[name] : fallback;
  if (resolved === undefined) return value; // unresolved, leave as-is (will fail to parse as color)
  return resolveVars(value.replace(whole, resolved.trim()), vars, depth + 1);
}

// ---------------------------------------------------------------------------
// Color parsing
// ---------------------------------------------------------------------------

const NAMED_COLORS = {
  white: "#ffffff",
  black: "#000000",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  gray: "#808080",
  grey: "#808080",
  transparent: "#ffffff00",
  none: null,
};

function parseColor(rawValue) {
  const value = rawValue.trim().toLowerCase();
  if (value === "none" || value === "transparent") {
    return { rgb: null, transparent: true, alphaIgnored: value === "transparent" };
  }
  if (/gradient/.test(value)) return { rgb: null, gradient: true };
  if (Object.prototype.hasOwnProperty.call(NAMED_COLORS, value)) {
    const hex = NAMED_COLORS[value];
    return hex ? { rgb: hexToRgb(hex), alphaIgnored: false } : { rgb: null, transparent: true };
  }
  if (value.startsWith("#")) {
    const rgb = hexToRgb(value);
    if (rgb) return { rgb, alphaIgnored: /^#([0-9a-f]{8}|[0-9a-f]{4})$/.test(value) };
    return { rgb: null, unparseable: true };
  }
  const rgbMatch = value.match(/rgba?\(\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*(?:,\s*([\d.]+))?\)/);
  if (rgbMatch) {
    const toChannel = (s) => (s.endsWith("%") ? Math.round((parseFloat(s) / 100) * 255) : Math.round(parseFloat(s)));
    return {
      rgb: { r: toChannel(rgbMatch[1]), g: toChannel(rgbMatch[2]), b: toChannel(rgbMatch[3]) },
      alphaIgnored: rgbMatch[4] !== undefined && parseFloat(rgbMatch[4]) < 1,
    };
  }
  return { rgb: null, unparseable: true };
}

function hexToRgb(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3 || h.length === 4) {
    h = h.split("").map((c) => c + c).join("");
  }
  if (h.length !== 6 && h.length !== 8) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return null;
  return { r, g, b };
}

// ---------------------------------------------------------------------------
// WCAG relative luminance / contrast ratio
// ---------------------------------------------------------------------------

function relLuminance({ r, g, b }) {
  const chan = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

function contrastRatio(rgb1, rgb2) {
  const l1 = relLuminance(rgb1);
  const l2 = relLuminance(rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ---------------------------------------------------------------------------
// Selector filter: only look at body/container-level rules (per assignment
// scope — this is not a full-page audit of every button/link/badge).
// ---------------------------------------------------------------------------

const CONTAINER_KEYWORDS = ["container", "wrapper", "card", "page", "app", "main", "root", "form", "step"];

function isContainerLevelSelector(selector) {
  return selector
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .some((s) => {
      if (s === "body" || s === "html") return true;
      return CONTAINER_KEYWORDS.some((kw) => s.includes(kw));
    });
}

function extractDecl(body, prop) {
  // Grabs the LAST declaration of `prop` in the block (later wins, mirrors
  // CSS cascade within a single rule) but only for exact property name
  // matches (word-boundary via colon/semicolon), not sub-properties like
  // background-image.
  const re = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, "gi");
  let m;
  let last = null;
  while ((m = re.exec(body)) !== null) last = m[1].trim();
  return last;
}

// ---------------------------------------------------------------------------
// Main analysis
// ---------------------------------------------------------------------------

function analyze(html) {
  const styleBlocks = extractStyleBlocks(html);
  const allRules = styleBlocks.flatMap(parseRules);
  const vars = buildVariableMap(allRules);

  // Establish a page-level background fallback from body { background-color
  // | background }.
  let pageBg = null;
  for (const rule of allRules) {
    if (rule.selector.trim().toLowerCase() !== "body") continue;
    const bg = extractDecl(rule.body, "background-color") || extractDecl(rule.body, "background");
    if (bg) {
      const resolved = resolveVars(bg, vars);
      const parsed = parseColor(firstColorToken(resolved));
      if (parsed.rgb) pageBg = parsed;
    }
  }

  const results = [];
  for (const rule of allRules) {
    if (!isContainerLevelSelector(rule.selector)) continue;

    const colorRaw = extractDecl(rule.body, "color");
    if (!colorRaw) continue; // nothing to pair against

    let bgRaw = extractDecl(rule.body, "background-color") || extractDecl(rule.body, "background");
    let bgSource = "own rule";
    if (!bgRaw && pageBg) {
      bgSource = "assumed page background (body's background-color; NOT real cascade resolution)";
    }

    const colorResolved = resolveVars(colorRaw, vars);
    const colorParsed = parseColor(colorResolved);

    let bgParsed;
    if (bgRaw) {
      const bgResolved = resolveVars(firstColorToken(bgRaw), vars);
      bgParsed = parseColor(bgResolved);
    } else if (pageBg) {
      bgParsed = pageBg;
    } else {
      bgParsed = { rgb: null, unparseable: true };
    }

    results.push({ selector: rule.selector, colorRaw, bgRaw: bgRaw || "(none — using page background)", bgSource, colorParsed, bgParsed });
  }
  return results;
}

function firstColorToken(value) {
  // For `background: <color> url(...) ...` shorthand, or multi-layer
  // backgrounds, try to isolate the first color-looking token. If the value
  // contains url( or gradient, hand it through unchanged so parseColor can
  // flag it as uncheckable.
  if (/url\(|gradient/i.test(value)) return value;
  return value.trim();
}

function classify(ratio) {
  if (ratio >= 4.5) return "PASS (body text >=4.5:1, and large text >=3:1)";
  if (ratio >= 3) return "PASS for large text only (>=3:1), FAIL for body text (<4.5:1)";
  return "FAIL (<3:1 — fails even the large-text threshold)";
}

function usage() {
  console.error("Usage: node contrast-check.mjs <generated-form-url-or-html-file>");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    usage();
    process.exit(2);
  }
  const html = await readInput(args[0]);
  const results = analyze(html);

  if (results.length === 0) {
    console.log(
      "No body/container-level rule declared BOTH a `color` and a resolvable `background-color`/`background`."
    );
    console.log(
      "This is common when styling relies on cascade (color set high, background set low, or vice versa) — this script does not do full cascade resolution. Nothing to report; not a pass."
    );
    process.exit(0);
  }

  let anyFail = false;
  let anyUncheckable = false;

  for (const r of results) {
    const tagPieces = [];
    if (r.colorParsed.unparseable) tagPieces.push(`color "${r.colorRaw}" unparseable`);
    if (r.colorParsed.gradient) tagPieces.push("color is a gradient (uncheckable)");
    if (r.bgParsed.unparseable) tagPieces.push(`background "${r.bgRaw}" unparseable`);
    if (r.bgParsed.gradient) tagPieces.push("background is a gradient (uncheckable)");
    if (/url\(/i.test(r.bgRaw)) tagPieces.push("background includes an image (uncheckable)");

    if (!r.colorParsed.rgb || !r.bgParsed.rgb || tagPieces.length > 0) {
      anyUncheckable = true;
      console.log(`[UNCHECKABLE] ${r.selector} — color: ${r.colorRaw}; background: ${r.bgRaw} — ${tagPieces.join("; ") || "could not resolve to solid RGB"}`);
      continue;
    }

    const ratio = contrastRatio(r.colorParsed.rgb, r.bgParsed.rgb);
    const alphaNote = r.colorParsed.alphaIgnored || r.bgParsed.alphaIgnored ? " (alpha ignored — real ratio may differ)" : "";
    const bgNote = r.bgSource !== "own rule" ? ` [${r.bgSource}]` : "";
    const verdict = classify(ratio);
    if (ratio < 3) anyFail = true;
    console.log(
      `[${ratio >= 4.5 ? "OK   " : ratio >= 3 ? "WARN " : "FAIL "}] ${r.selector} — color ${r.colorRaw} on background ${r.bgRaw}${bgNote} — ratio ${ratio.toFixed(2)}:1 — ${verdict}${alphaNote}`
    );
  }

  console.log(
    `\n${anyFail ? "FAIL" : "OK"}: ${results.length} rule(s) checked${anyUncheckable ? "; some rules were UNCHECKABLE — verify those by eye" : ""}.`
  );
  process.exit(anyFail ? 1 : 0);
}

main().catch((err) => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});
