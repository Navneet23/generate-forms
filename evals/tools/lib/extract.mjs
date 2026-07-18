// Stage 1: render the source URL, resolve template landing pages to their live
// form when possible, capture a hero screenshot + rendered text for Gemini.
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import { STYLE_GUIDES_DIR } from "./env.mjs";

const PAGE_TIMEOUT_MS = 45_000;
const SETTLE_MS = 3_500; // extra wait for SPA animations/fonts after network idle
const MAX_TEXT_CHARS = 30_000;
const MAX_JSON_CHARS = 60_000;
const THIN_TEXT_THRESHOLD = 200;

// Domains that serve live forms — used to spot embedded previews on template landing pages.
const LIVE_FORM_PATTERNS = [
  /https?:\/\/[^"'\s]*form\.typeform\.com\/to\/[A-Za-z0-9]+/,
  /https?:\/\/[^"'\s]*\.typeform\.com\/to\/[A-Za-z0-9]+/,
  /https?:\/\/form\.jotform\.com\/[0-9]{8,}/,
  /https?:\/\/tally\.so\/r\/[A-Za-z0-9]+/,
  /https?:\/\/forms\.fillout\.com\/t\/[A-Za-z0-9]+/,
  /https?:\/\/[a-z0-9-]+\.paperform\.co\/?[^"'\s]*/,
];

let browserPromise = null;
function getBrowser() {
  browserPromise ??= puppeteer.launch({ headless: true });
  return browserPromise;
}

export async function closeBrowser() {
  if (browserPromise) await (await browserPromise).close();
  browserPromise = null;
}

async function findEmbeddedFormUrl(page) {
  // 1. iframes pointing at a live-form domain
  const iframeSrcs = await page.$$eval("iframe", (els) => els.map((e) => e.src).filter(Boolean));
  for (const src of iframeSrcs) {
    if (LIVE_FORM_PATTERNS.some((re) => re.test(src))) return src;
  }
  // 2. live-form URLs anywhere in the HTML (preview links, data attributes)
  const html = await page.content();
  for (const re of LIVE_FORM_PATTERNS) {
    const m = html.match(re);
    if (m) return m[0];
  }
  return null;
}

async function collectPageData(page) {
  const text = await page.evaluate(() => document.body?.innerText ?? "");
  // Embedded JSON state often contains the full question list that innerText
  // misses on one-question-at-a-time SPAs (Typeform, Fillout, ...).
  const jsonBlobs = await page.evaluate(() => {
    const blobs = [];
    for (const s of document.querySelectorAll(
      'script[type="application/json"], script#__NEXT_DATA__'
    )) {
      if (s.textContent) blobs.push(s.textContent);
    }
    return blobs;
  });
  return {
    text: text.slice(0, MAX_TEXT_CHARS),
    jsonState: jsonBlobs.join("\n").slice(0, MAX_JSON_CHARS),
  };
}

/**
 * Returns { resolvedFormUrl, screenshotPath, text, jsonState, thinExtraction }.
 * Throws on navigation failure/timeout — caller records the error in the manifest.
 */
export async function extract(source) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(source.url, { waitUntil: "networkidle2", timeout: PAGE_TIMEOUT_MS });
    await new Promise((r) => setTimeout(r, SETTLE_MS));

    // Template landing pages: hop to the embedded live form when one exists.
    let resolvedFormUrl = source.url;
    if (source.isTemplatePage) {
      const embedded = await findEmbeddedFormUrl(page);
      if (embedded && embedded !== source.url) {
        resolvedFormUrl = embedded;
        await page.goto(embedded, { waitUntil: "networkidle2", timeout: PAGE_TIMEOUT_MS });
        await new Promise((r) => setTimeout(r, SETTLE_MS));
      }
    }

    fs.mkdirSync(STYLE_GUIDES_DIR, { recursive: true });
    const screenshotPath = path.join(STYLE_GUIDES_DIR, `${source.id}.png`);
    await page.screenshot({ path: screenshotPath }); // hero screen only, per requirements

    const { text, jsonState } = await collectPageData(page);
    return {
      resolvedFormUrl,
      screenshotPath,
      text,
      jsonState,
      thinExtraction: text.trim().length < THIN_TEXT_THRESHOLD,
    };
  } finally {
    await page.close().catch(() => {});
  }
}
