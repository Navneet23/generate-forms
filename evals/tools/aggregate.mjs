// Rebuilds evals/manifest.json from the per-item shard files and prints a status table.
import { aggregateManifest } from "./lib/manifest.mjs";

const manifest = aggregateManifest();
const items = Object.values(manifest.items);
const done = items.filter((i) =>
  ["extract", "recreate", "create", "verify"].every((s) => i.stages[s] === "done")
);
const failed = items.filter((i) => Object.values(i.stages).includes("failed"));

console.log(`manifest.json rebuilt: ${items.length} items, ${done.length} complete, ${failed.length} with failures`);
for (const i of failed) {
  const lastErr = i.errors[i.errors.length - 1];
  console.log(`  ✗ ${i.id}: ${lastErr?.stage} — ${lastErr?.message.slice(0, 100)}`);
}
const thin = items.filter((i) => i.thinExtraction).map((i) => i.id);
if (thin.length) console.log(`thin extractions: ${thin.join(", ")}`);
