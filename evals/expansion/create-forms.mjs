// Creates real, published Google Forms from evals/expansion/base-forms.json using
// the existing Forms-API tooling (evals/tools/lib/gforms.mjs — same path that made
// the original 37). Requires evals/tools/credentials/token.json (OAuth, forms.body).
//
// Usage (from evals/expansion/):
//   node create-forms.mjs                                create from base-forms.json
//   node create-forms.mjs --forms=<f> --out=<f>          use a different forms/output file
//   node create-forms.mjs --only=<id>                    create just one form by its id
//
// Resumable: results are appended to the output file; a form already listed there
// (with a formId) is skipped. Unknown args abort (fail-closed, DR-6).
import fs from "fs";
import { createGoogleForm } from "../tools/lib/gforms.mjs";

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith("--only="))?.slice(7);
const formsArg = args.find((a) => a.startsWith("--forms="))?.slice(8) ?? "base-forms.json";
const outArg = args.find((a) => a.startsWith("--out="))?.slice(6) ?? "created-forms.json";
const unknown = args.filter(
  (a) => !a.startsWith("--only=") && !a.startsWith("--forms=") && !a.startsWith("--out=")
);
if (unknown.length) {
  console.error(`Unknown argument(s): ${unknown.join(", ")}`);
  console.error("Usage: node create-forms.mjs [--forms=<file>] [--out=<file>] [--only=<id>]");
  process.exit(1);
}

const BASE = new URL(`./${formsArg}`, import.meta.url);
const OUT = new URL(`./${outArg}`, import.meta.url);
const { forms } = JSON.parse(fs.readFileSync(BASE, "utf8"));
const created = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : { forms: [] };
const doneIds = new Set(created.forms.filter((f) => f.formId).map((f) => f.id));

let ok = 0, skipped = 0, failed = 0;
for (const form of forms) {
  if (only && form.id !== only) continue;
  if (doneIds.has(form.id)) {
    console.log(`skip  ${form.id} — already created`);
    skipped++;
    continue;
  }
  try {
    const res = await createGoogleForm(form);
    const record = {
      id: form.id,
      kind: form.kind,
      styleGuide: form.styleGuide,
      useCase: form.useCase,
      title: form.title,
      formId: res.formId,
      editUrl: res.editUrl,
      responderUrl: res.responderUrl,
      questionCount: res.questionCount,
    };
    // Replace any prior errored entry for this id, then append.
    created.forms = created.forms.filter((f) => f.id !== form.id);
    created.forms.push(record);
    fs.writeFileSync(OUT, JSON.stringify(created, null, 2) + "\n");
    console.log(`OK    ${form.id} -> ${res.formId} (${res.questionCount} q) ${res.responderUrl}`);
    ok++;
  } catch (err) {
    console.error(`FAIL  ${form.id} -> ${err.message}`);
    failed++;
  }
}
console.log(`\ndone: ${ok} created, ${skipped} skipped, ${failed} failed`);
if (failed) process.exit(1);
