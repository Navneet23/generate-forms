// Eval set pipeline orchestrator.
//
//   node run.mjs                 process all non-skipped sources (resumes where it left off)
//   node run.mjs --only=<id>     process a single source
//   node run.mjs --retry-failed  reprocess only items with a failed stage
//   node run.mjs --force         redo stages even if already done (note: recreates the form!)
//
// Stages per item: extract → recreate → create(+publish) → verify.
// Every stage failure is recorded in evals/manifest-items/<id>.json and the run
// continues. Per-item shard files make parallel runs safe as long as no two
// runs process the SAME id. Run aggregate.mjs afterwards to rebuild manifest.json.
import fs from "fs";
import { SOURCES_PATH } from "./lib/env.mjs";
import { getItem, markStage } from "./lib/manifest.mjs";
import { extract, closeBrowser } from "./lib/extract.mjs";
import { recreateStructure } from "./lib/recreate.mjs";
import { createGoogleForm } from "./lib/gforms.mjs";
import { verifyPublishedForm } from "./lib/verify.mjs";

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith("--only="))?.slice(7);
const retryFailed = args.includes("--retry-failed");
const force = args.includes("--force");

// Unknown flags must never silently mean "run everything".
const unknown = args.filter(
  (a) => !a.startsWith("--only=") && a !== "--retry-failed" && a !== "--force"
);
if (unknown.length) {
  console.error(`Unknown argument(s): ${unknown.join(", ")}`);
  console.error("Usage: node run.mjs [--only=<id>] [--retry-failed] [--force]");
  process.exit(1);
}

const { sources } = JSON.parse(fs.readFileSync(SOURCES_PATH, "utf8"));

function shouldRun(item, stage) {
  if (force) return true;
  return item.stages[stage] !== "done";
}

let ok = 0,
  failed = 0,
  skipped = 0;
const thin = [];

for (const source of sources) {
  if (source.skip) {
    skipped++;
    continue;
  }
  if (only && source.id !== only) continue;

  const item = getItem(source);
  if (retryFailed && !Object.values(item.stages).includes("failed")) continue;

  const done = ["extract", "recreate", "create", "verify"].every(
    (s) => item.stages[s] === "done"
  );
  if (done && !force) {
    console.log(`✓ ${source.id} — already complete`);
    if (item.thinExtraction) thin.push(source.id);
    ok++;
    continue;
  }

  console.log(`\n=== ${source.id} (${source.business} — ${source.formType}) ===`);
  let itemFailed = false;

  // Stage 1: extract
  if (shouldRun(item, "extract")) {
    try {
      console.log(`  extract: rendering ${source.url}`);
      const extraction = await extract(source);
      item.resolvedFormUrl = extraction.resolvedFormUrl;
      item.screenshot = `style-guides/${source.id}.png`;
      item.thinExtraction = extraction.thinExtraction;
      // Persist text so recreate can rerun without re-rendering.
      item.extraction = {
        text: extraction.text,
        jsonState: extraction.jsonState,
        thinExtraction: extraction.thinExtraction,
      };
      markStage(item, "extract", "done");
      console.log(
        `  extract: done (${extraction.text.length} chars${extraction.thinExtraction ? ", THIN — flag for review" : ""})`
      );
    } catch (err) {
      markStage(item, "extract", "failed", err);
      console.error(`  extract: FAILED — ${err.message}`);
      itemFailed = true;
    }
  }

  // Stage 2: recreate (Gemini)
  if (!itemFailed && shouldRun(item, "recreate")) {
    try {
      console.log("  recreate: asking Gemini for the form structure");
      const structure = await recreateStructure(source, item.extraction);
      item.structure = structure;
      markStage(item, "recreate", "done");
      console.log(`  recreate: done — "${structure.title}" (${structure.questions.length} questions)`);
    } catch (err) {
      markStage(item, "recreate", "failed", err);
      console.error(`  recreate: FAILED — ${err.message}`);
      itemFailed = true;
    }
  }

  // Stage 3+4: create + publish via Forms API
  if (!itemFailed && shouldRun(item, "create")) {
    try {
      console.log("  create: building Google Form");
      item.form = await createGoogleForm(item.structure);
      markStage(item, "create", "done");
      console.log(`  create: done — ${item.form.responderUrl}`);
    } catch (err) {
      markStage(item, "create", "failed", err);
      console.error(`  create: FAILED — ${err.message}`);
      itemFailed = true;
    }
  }

  // Stage 5: verify public scrapability
  if (!itemFailed && shouldRun(item, "verify")) {
    try {
      console.log("  verify: checking FB_PUBLIC_LOAD_DATA_ on responder URL");
      const { verifiedQuestions } = await verifyPublishedForm(item.form.responderUrl, item.structure);
      markStage(item, "verify", "done");
      console.log(`  verify: done — all ${verifiedQuestions} questions present in public payload`);
    } catch (err) {
      markStage(item, "verify", "failed", err);
      console.error(`  verify: FAILED — ${err.message}`);
      itemFailed = true;
    }
  }

  if (item.thinExtraction) thin.push(source.id);
  itemFailed ? failed++ : ok++;
}

await closeBrowser();

console.log(`\n=== Summary: ${ok} ok, ${failed} failed, ${skipped} skipped (dead links) ===`);
if (thin.length) console.log(`Thin extractions to review manually: ${thin.join(", ")}`);
