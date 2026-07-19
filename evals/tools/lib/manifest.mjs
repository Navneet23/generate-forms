import fs from "fs";
import path from "path";
import { EVALS_DIR, MANIFEST_PATH } from "./env.mjs";

// Per-item shard files so parallel pipeline runs never clobber each other.
// evals/manifest.json is a generated aggregate — run aggregate.mjs to rebuild it.
const ITEMS_DIR = path.join(EVALS_DIR, "manifest-items");

export function getItem(source) {
  const file = path.join(ITEMS_DIR, `${source.id}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  return {
    id: source.id,
    sourceUrl: source.url,
    stages: {},
    errors: [],
  };
}

export function saveItem(item) {
  fs.mkdirSync(ITEMS_DIR, { recursive: true });
  fs.writeFileSync(path.join(ITEMS_DIR, `${item.id}.json`), JSON.stringify(item, null, 2) + "\n");
}

export function markStage(item, stage, status, error) {
  item.stages[stage] = status;
  if (status === "failed" && error) {
    item.errors.push({ stage, message: String(error.message ?? error), at: new Date().toISOString() });
  }
  item.updatedAt = new Date().toISOString();
  saveItem(item);
}

export function loadAllItems() {
  if (!fs.existsSync(ITEMS_DIR)) return {};
  const items = {};
  for (const f of fs.readdirSync(ITEMS_DIR).filter((f) => f.endsWith(".json"))) {
    const item = JSON.parse(fs.readFileSync(path.join(ITEMS_DIR, f), "utf8"));
    items[item.id] = item;
  }
  return items;
}

export function aggregateManifest() {
  const manifest = { generatedAt: new Date().toISOString(), items: loadAllItems() };
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}
