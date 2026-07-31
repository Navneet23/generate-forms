// Generates evals/expansion/pilot-overview.md — a single human-readable view of the
// expansion pilot: every item's base form + style guide + prompt together, plus the
// full form specs and prompt bank. Regenerate after editing any of the source JSONs.
//
// Usage (from evals/expansion/):  node generate-overview.mjs
import fs from "fs";

const read = (f) => JSON.parse(fs.readFileSync(new URL(f, import.meta.url), "utf8"));
const baseForms = read("./base-forms.json").forms;
const created = read("./created-forms.json").forms;
const prompts = read("./prompt-bank.json").prompts;
const items = read("./pilot-items.json").items;

const byId = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));
const bf = byId(baseForms);
const cf = byId(created);
const pr = byId(prompts);

const editUrl = (formId) => `https://docs.google.com/forms/d/${formId}/edit`;
const L = [];
L.push("# Eval Expansion — Pilot Overview");
L.push("");
L.push("_Generated from base-forms.json + created-forms.json + prompt-bank.json + pilot-items.json._");
L.push(`_${items.length} items · ${baseForms.length} base forms · ${prompts.length} prompts._`);
L.push("");

// 1. The "together" view: items grouped by track
L.push("## Items (form + style guide + prompt)");
for (const track of ["kind-b", "no-guide"]) {
  const rows = items.filter((it) => it.track === track);
  L.push("");
  L.push(`### ${track === "kind-b" ? "Kind-B — brand image" : "No style guide"} (${rows.length})`);
  L.push("");
  L.push("| Item | Base form (use case) | Style guide | Prompt |");
  L.push("|---|---|---|---|");
  for (const it of rows) {
    const form = bf[it.baseFormId] || {};
    const p = pr[it.promptId] || {};
    const sg = it.styleGuide ? `\`${it.styleGuide}\`` : "— none —";
    const promptCell = `**[${p.class}]** ${(p.text || "").replace(/\|/g, "\\|")}`;
    L.push(`| \`${it.id}\` | ${form.title || it.baseFormId} (${form.useCase || "?"}) | ${sg} | ${promptCell} |`);
  }
}

// 2. Base form specs
L.push("");
L.push("## Base forms (real Google Forms)");
for (const form of baseForms) {
  const c = cf[form.id] || {};
  L.push("");
  L.push(`### ${form.title}`);
  const meta = [`kind: ${form.kind}`, `use case: ${form.useCase}`];
  if (form.styleGuide) meta.push(`brand image: \`${form.styleGuide}\``);
  L.push(`_${meta.join(" · ")}_`);
  if (c.formId) {
    L.push("");
    L.push(`- Edit: ${editUrl(c.formId)}`);
    L.push(`- Live (responder): ${c.responderUrl}`);
  }
  L.push("");
  L.push(`> ${form.description}`);
  L.push("");
  form.questions.forEach((q, i) => {
    const bits = [q.type];
    if (q.required) bits.push("required");
    if (q.options) bits.push(`options: ${q.options.join(", ")}`);
    if (q.type === "linear_scale") bits.push(`scale ${q.low}–${q.high} (${q.lowLabel} → ${q.highLabel})`);
    L.push(`${i + 1}. **${q.text}** — _${bits.join("; ")}_`);
  });
}

// 3. Prompt bank
L.push("");
L.push("## Prompt bank");
L.push("");
L.push("| ID | Class | styleGuide | Text |");
L.push("|---|---|---|---|");
for (const p of prompts) {
  L.push(`| \`${p.id}\` | ${p.class} | ${p.styleGuide} | ${p.text.replace(/\|/g, "\\|")} |`);
}

L.push("");
fs.writeFileSync(new URL("./pilot-overview.md", import.meta.url), L.join("\n"));
console.log(`Wrote pilot-overview.md (${items.length} items, ${baseForms.length} forms, ${prompts.length} prompts)`);
