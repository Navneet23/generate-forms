// Captures a style-guide candidate screenshot for the eval-set expansion
// (see requirements/eval_set_expansion.md, "Sourcing procedure").
//
// Usage (from evals/tools/, where puppeteer is installed):
//   node capture-candidate.mjs --url=<page url> --out=<path/to/file.png>
//
// Mirrors the capture settings of lib/extract.mjs (the original pipeline):
// 1440x900 viewport, networkidle2 + settle wait, hero screen only.
import puppeteer from "puppeteer";

const PAGE_TIMEOUT_MS = 45_000;
const SETTLE_MS = 3_500; // extra wait for SPA animations/fonts after network idle

let url, out;
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith("--url=")) url = arg.slice("--url=".length);
  else if (arg.startsWith("--out=")) out = arg.slice("--out=".length);
  else {
    console.error(`Unknown argument: ${arg}`);
    process.exit(1);
  }
}
if (!url || !out || !out.endsWith(".png")) {
  console.error("Usage: node capture-candidate.mjs --url=<page url> --out=<file.png>");
  process.exit(1);
}

const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(url, { waitUntil: "networkidle2", timeout: PAGE_TIMEOUT_MS });
  await new Promise((r) => setTimeout(r, SETTLE_MS));
  await page.screenshot({ path: out });
  console.log(`Saved ${out}`);
} finally {
  await browser.close();
}
