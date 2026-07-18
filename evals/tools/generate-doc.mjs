// Generates evals/eval-set-doc.html — an HTML table of the eval set (form link,
// style guide link, prompt) for upload to Google Drive as a Google Doc.
import fs from "fs";
import path from "path";
import { EVALS_DIR, SOURCES_PATH } from "./lib/env.mjs";
import { loadAllItems } from "./lib/manifest.mjs";

const { sources, standardPrompt } = JSON.parse(fs.readFileSync(SOURCES_PATH, "utf8"));
const items = loadAllItems();

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const rows = [];
let complete = 0;
for (const source of sources) {
  if (source.skip) continue;
  const item = items[source.id];
  const isComplete =
    item && ["extract", "recreate", "create", "verify"].every((s) => item.stages[s] === "done");
  if (isComplete) complete++;
  const status = !item
    ? "not processed"
    : isComplete
      ? item.thinExtraction
        ? "complete (thin extraction — review)"
        : "complete"
      : `failed: ${Object.entries(item.stages).find(([, v]) => v === "failed")?.[0] ?? "incomplete"}`;
  rows.push(`<tr>
  <td>${esc(source.business)}</td>
  <td>${esc(source.formType)}</td>
  <td>${esc(source.product)}</td>
  <td>${item?.form?.responderUrl ? `<a href="${esc(item.form.responderUrl)}">Google Form</a>` : "—"}</td>
  <td>${item?.styleGuideUrl ? `<a href="${esc(item.styleGuideUrl)}">Style guide</a>` : "—"}</td>
  <td>${esc(standardPrompt)}</td>
  <td><a href="${esc(source.url)}">source</a></td>
  <td>${esc(status)}</td>
</tr>`);
}

const html = `<h1>Forms Restyler — Eval Set</h1>
<p>Generated ${new Date().toISOString().slice(0, 10)} · ${complete} of ${rows.length} items complete ·
Each row: recreated Google Form + style-guide screenshot of the original + the standard prompt.
See evals/manifest.json in the repo for full detail.</p>
<table border="1" cellpadding="4" cellspacing="0">
<tr><th>Business</th><th>Form type</th><th>Original product</th><th>Google Form</th><th>Style guide</th><th>Prompt</th><th>Original form</th><th>Status</th></tr>
${rows.join("\n")}
</table>`;

const out = path.join(EVALS_DIR, "eval-set-doc.html");
fs.writeFileSync(out, html);
console.log(`wrote ${out} (${rows.length} rows, ${complete} complete)`);
