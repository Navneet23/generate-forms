// Uploads style-guide screenshots to Vercel Blob (the app's image store) so the
// eval Google Doc can link to them. Records the URL as styleGuideUrl in each
// item shard. Run AFTER the pipeline (not concurrently — it writes shard files).
import fs from "fs";
import path from "path";
import { put } from "@vercel/blob";
import { STYLE_GUIDES_DIR, REPO_ROOT } from "./lib/env.mjs";
import { loadAllItems, saveItem } from "./lib/manifest.mjs";

function getBlobToken() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  const envPath = path.join(REPO_ROOT, "app", ".env.local");
  const line = fs
    .readFileSync(envPath, "utf8")
    .split("\n")
    .find((l) => l.trim().startsWith("BLOB_READ_WRITE_TOKEN="));
  if (!line) throw new Error("BLOB_READ_WRITE_TOKEN not found");
  return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

const token = getBlobToken();
const items = Object.values(loadAllItems());
let uploaded = 0,
  skipped = 0,
  failed = 0;

for (const item of items) {
  if (item.styleGuideUrl) {
    skipped++;
    continue;
  }
  const file = path.join(STYLE_GUIDES_DIR, `${item.id}.png`);
  if (!fs.existsSync(file)) {
    console.log(`  - ${item.id}: no screenshot, skipping`);
    skipped++;
    continue;
  }
  try {
    const blob = await put(`eval-style-guides/${item.id}.png`, fs.readFileSync(file), {
      access: "public",
      token,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    item.styleGuideUrl = blob.url;
    saveItem(item);
    uploaded++;
    console.log(`  ✓ ${item.id}: ${blob.url}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${item.id}: ${err.message}`);
  }
}
console.log(`\nuploaded ${uploaded}, skipped ${skipped}, failed ${failed}`);
