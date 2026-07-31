// Generates a SHAREABLE, self-contained view of the pilot eval set — one row per
// item (form + prompt + style guide) — as both markdown (eval-set.md, committed) and
// HTML (--html=<path>, for uploading to Google Docs). Regenerate after editing the
// source JSONs. Usage (from evals/expansion/):
//   node generate-eval-set-doc.mjs [--html=<path>]
import fs from "fs";

const read = (f) => JSON.parse(fs.readFileSync(new URL(f, import.meta.url), "utf8"));
const created = read("./created-forms.json").forms;
const prompts = read("./prompt-bank.json").prompts;
const items = read("./pilot-items.json").items;
const byId = (a) => Object.fromEntries(a.map((x) => [x.id, x]));
const cf = byId(created), pr = byId(prompts);

const htmlArg = process.argv.find((a) => a.startsWith("--html="))?.slice(7);

// class -> plain descriptive name
const TYPE_NAME = {
  P1: "Open-ended", P2: "Specific layout", P3: "Copy layout, new theme",
  P4: "Brand colors, own layout", P5: "Fully specified design", P6: "Mood only",
};
// how each instruction type is defined for a lay reader
const TYPE_DEF = {
  "Open-ended": "Minimal direction — the tool decides the whole look itself. (e.g. “Make this form beautiful.”)",
  "Specific layout": "Asks for a particular structure — such as multi-step (one question per screen) or a single scrolling column.",
  "Copy layout, new theme": "Reproduce a reference form’s layout but change its colours/theme. (Needs a form screenshot as the style guide; not used in this pilot yet.)",
  "Brand colors, own layout": "Take the colour palette from the attached brand image, but design the layout freely.",
  "Fully specified design": "Exact colours and layout are described in words, with no reference image attached.",
  "Mood only": "A mood or vibe is given (e.g. “warm and botanical”); the layout is left to the tool.",
};
const SG_TYPE = { brand: "Brand image", none: "None", form: "Form screenshot" };
const SG_TYPE_DEF = {
  "Brand image": "A non-form image of a brand (packaging, product, hero, logo world). The tool pulls its colours and mood onto the form.",
  "None": "No reference image is attached; the styling direction is text-only.",
  "Form screenshot": "A picture of an already-designed form to visually match. (Not used in this pilot yet.)",
};

const rows = items.map((it, i) => {
  const form = cf[it.baseFormId] || {};
  const p = pr[it.promptId] || {};
  const sgKind = it.styleGuide ? (it.styleGuide.startsWith("brand-") ? "brand" : "form") : "none";
  return {
    n: i + 1,
    formTitle: form.title || it.baseFormId,
    formUrl: form.responderUrl || "",
    type: TYPE_NAME[p.class] || p.class,
    text: p.text || "",
    sgType: SG_TYPE[sgKind],
    sg: it.styleGuide || "—",
  };
});
const typesUsed = [...new Set(rows.map((r) => r.type))];
const sgTypesUsed = [...new Set(rows.map((r) => r.sgType))];

const INTRO =
  "This is the pilot test set for the Forms AI Restyler — a tool that redesigns a plain Google Form into a polished, on-brand one. Each row below is a single test case: a real Google Form, a styling instruction, and (sometimes) a style-guide image. The tool generates a restyled version from these inputs, which is then rated on how good it looks and how well it followed the instruction.";

// ---------- Markdown ----------
const md = [];
md.push("# Forms AI Restyler — Eval Set (Pilot)");
md.push("");
md.push(INTRO);
md.push("");
md.push(`_${rows.length} test cases._`);
md.push("");
md.push("| # | Form (live link) | Instruction type | Prompt (styling instruction) | Style guide type | Style guide |");
md.push("|---|---|---|---|---|---|");
for (const r of rows) {
  const link = r.formUrl ? `[${r.formTitle}](${r.formUrl})` : r.formTitle;
  md.push(`| ${r.n} | ${link} | ${r.type} | ${r.text.replace(/\|/g, "\\|")} | ${r.sgType} | ${r.sg} |`);
}
md.push("");
md.push("## Definitions");
md.push("");
md.push("**Instruction type** — what kind of styling direction the prompt gives:");
md.push("");
for (const t of typesUsed) md.push(`- **${t}** — ${TYPE_DEF[t]}`);
md.push("");
md.push("**Style guide type** — what kind of visual reference (if any) is attached:");
md.push("");
for (const t of sgTypesUsed) md.push(`- **${t}** — ${SG_TYPE_DEF[t]}`);
md.push("");
fs.writeFileSync(new URL("./eval-set.md", import.meta.url), md.join("\n"));

// ---------- HTML (for Google Docs conversion) ----------
if (htmlArg) {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const h = [];
  h.push("<h1>Forms AI Restyler — Eval Set (Pilot)</h1>");
  h.push(`<p>${esc(INTRO)}</p>`);
  h.push(`<p><i>${rows.length} test cases.</i></p>`);
  h.push('<table border="1" cellspacing="0" cellpadding="6">');
  h.push("<tr><th>#</th><th>Form (live link)</th><th>Instruction type</th><th>Prompt (styling instruction)</th><th>Style guide type</th><th>Style guide</th></tr>");
  for (const r of rows) {
    const link = r.formUrl ? `<a href="${esc(r.formUrl)}">${esc(r.formTitle)}</a>` : esc(r.formTitle);
    h.push(`<tr><td>${r.n}</td><td>${link}</td><td>${esc(r.type)}</td><td>${esc(r.text)}</td><td>${esc(r.sgType)}</td><td>${esc(r.sg)}</td></tr>`);
  }
  h.push("</table>");
  h.push("<h2>Definitions</h2>");
  h.push("<p><b>Instruction type</b> — what kind of styling direction the prompt gives:</p><ul>");
  for (const t of typesUsed) h.push(`<li><b>${esc(t)}</b> — ${esc(TYPE_DEF[t])}</li>`);
  h.push("</ul>");
  h.push("<p><b>Style guide type</b> — what kind of visual reference (if any) is attached:</p><ul>");
  for (const t of sgTypesUsed) h.push(`<li><b>${esc(t)}</b> — ${esc(SG_TYPE_DEF[t])}</li>`);
  h.push("</ul>");
  fs.writeFileSync(htmlArg, `<!doctype html><html><body>${h.join("\n")}</body></html>`);
}
console.log(`Wrote eval-set.md (${rows.length} rows)${htmlArg ? " + html" : ""}`);
