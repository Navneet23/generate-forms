// Generates the shareable text-only eval-set doc from text-track-items.json +
// text-track-created.json: text-prompts.md (committed) and HTML (--html=<path>, for
// Google Docs). Six columns + a plain-language legend. Also prints the distribution.
// Usage (from evals/expansion/):  node generate-text-track-doc.mjs [--html=<path>]
import fs from "fs";

const read = (f) => JSON.parse(fs.readFileSync(new URL(f, import.meta.url), "utf8"));
const items = read("./text-track-items.json").items;
const forms = Object.fromEntries(read("./text-track-created.json").forms.map((f) => [f.id, f]));
const htmlArg = process.argv.find((a) => a.startsWith("--html="))?.slice(7);

const DETAIL = { simple: "Simple", detailed: "Detailed" };
const LT = { none: "None", "layout-only": "Layout only", "theme-only": "Theme only", both: "Both" };
const CTX = { agnostic: "Agnostic", "domain-aware": "Domain-aware" };
const PHR = { polished: "Polished", messy: "Messy" };

const rows = items.map((it, i) => {
  const f = forms[it.formId] || {};
  return { n: i + 1, title: f.title || it.formId, url: f.responderUrl || "",
    prompt: it.prompt, detail: DETAIL[it.detail], lt: LT[it.layoutTheme],
    ctx: CTX[it.formContext], phr: PHR[it.phrasing] };
});

const INTRO =
  "This is the text-only slice of the eval set for the Forms AI Restyler — a tool that redesigns a plain Google Form into a polished one. Every row is one test case: a real Google Form plus a typed styling instruction (no reference image). The tool restyles the form from the instruction, and the result is rated on how good it looks and how well it followed the instruction. The last four columns classify the *kind* of instruction (see Definitions).";

const DEFS = [
  ["Detail", [
    ["Simple", "Loose direction — a basic layout (one question per screen, or a single page) and/or a few mood words. The tool fills in the rest."],
    ["Detailed", "Precise direction — a complex layout (e.g. hero image beside each question, a cover page) and/or concrete styling (named colours, fonts, background/hero images)."],
  ]],
  ["Layout/theme specified", [
    ["None", "The prompt pins down neither the layout nor the theme."],
    ["Layout only", "Specifies the layout (structure) but not the colours/fonts."],
    ["Theme only", "Specifies the visual theme — colour, font, background, or a hero/header image — but not the layout."],
    ["Both", "Specifies both the layout and the theme."],
  ]],
  ["Form context", [
    ["Agnostic", "A generic instruction that could apply to any form (\"make this form clean\")."],
    ["Domain-aware", "References what the form is for (\"this is a summer-camp signup — make it playful\")."],
  ]],
  ["Phrasing", [
    ["Polished", "A clean, well-formed instruction."],
    ["Messy", "Casual, natural phrasing (full words, no abbreviations) — how people often actually type."],
  ]],
];

// distribution print
const count = (key) => rows.reduce((m, r) => ((m[r[key]] = (m[r[key]] || 0) + 1), m), {});
console.log("detail:", count("detail"), "| layout/theme:", count("lt"), "| context:", count("ctx"), "| phrasing:", count("phr"));

// ---------- Markdown ----------
const md = ["# Forms AI Restyler — Eval Set: Text-only Prompts", "", INTRO, "", `_${rows.length} test cases._`, ""];
md.push("| # | Form (live link) | Text prompt | Detail | Layout/theme | Form context | Phrasing |");
md.push("|---|---|---|---|---|---|---|");
for (const r of rows) {
  const link = r.url ? `[${r.title}](${r.url})` : r.title;
  md.push(`| ${r.n} | ${link} | ${r.prompt.replace(/\|/g, "\\|")} | ${r.detail} | ${r.lt} | ${r.ctx} | ${r.phr} |`);
}
md.push("", "## Definitions", "");
for (const [group, defs] of DEFS) {
  md.push(`**${group}**`, "");
  for (const [name, def] of defs) md.push(`- **${name}** — ${def}`);
  md.push("");
}
fs.writeFileSync(new URL("./text-prompts.md", import.meta.url), md.join("\n"));

// ---------- HTML ----------
if (htmlArg) {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const h = [`<h1>Forms AI Restyler — Eval Set: Text-only Prompts</h1>`, `<p>${esc(INTRO)}</p>`, `<p><i>${rows.length} test cases.</i></p>`];
  h.push('<table border="1" cellspacing="0" cellpadding="6">');
  h.push("<tr><th>#</th><th>Form (live link)</th><th>Text prompt</th><th>Detail</th><th>Layout/theme</th><th>Form context</th><th>Phrasing</th></tr>");
  for (const r of rows) {
    const link = r.url ? `<a href="${esc(r.url)}">${esc(r.title)}</a>` : esc(r.title);
    h.push(`<tr><td>${r.n}</td><td>${link}</td><td>${esc(r.prompt)}</td><td>${esc(r.detail)}</td><td>${esc(r.lt)}</td><td>${esc(r.ctx)}</td><td>${esc(r.phr)}</td></tr>`);
  }
  h.push("</table>", "<h2>Definitions</h2>");
  for (const [group, defs] of DEFS) {
    h.push(`<p><b>${esc(group)}</b></p><ul>`);
    for (const [name, def] of defs) h.push(`<li><b>${esc(name)}</b> — ${esc(def)}</li>`);
    h.push("</ul>");
  }
  fs.writeFileSync(htmlArg, `<!doctype html><html><body>${h.join("\n")}</body></html>`);
}
console.log(`Wrote text-prompts.md (${rows.length} rows)${htmlArg ? " + html" : ""}`);
