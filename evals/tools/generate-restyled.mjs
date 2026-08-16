// Generates restyled forms for eval items by driving the app itself.
//
//   node generate-restyled.mjs --only=<id>[,<id>...]   specific items
//   node generate-restyled.mjs --all                   every completed non-skipped item
//   node generate-restyled.mjs --retry-failed          only configs that previously failed
//
// Optional model selection:
//   --image-models=<id>[,<id>]   restrict image configs (default: both)
//   --text-models=<id>[,<id>]    vary the text model too (default: the app's own default)
//
// Without --text-models a config is one image model, keyed by the image-model id
// (the original scheme — the pre-existing records resume under it). With
// --text-models, configs are the cross product and are keyed "<text>|<image>",
// so the two schemes never collide.
//
// Per item, per config:
//   1. scrape the recreated Google Form via the LOCAL dev server (working-tree SI)
//   2. generate via LOCAL /api/generate (SSE) with the style-guide screenshot
//   3. rewrite the baked localhost submit URL to the prod origin
//   4. publish via PROD /api/publish (prod /f/{id} link, shared Redis/Blob)
//   5. extend via PROD /api/forms/{id}/extend (1-year persistence)
// Results land in the item's manifest shard under `generated[<config>]`.
//
// IMPORTANT: generation runs LOCALLY so the working-tree system instructions are
// what gets evaluated — prod may be on an older SI. Do not point generation at prod.
import fs from "fs";
import path from "path";
import { SOURCES_PATH, STYLE_GUIDES_DIR } from "./lib/env.mjs";
import { getItem, saveItem } from "./lib/manifest.mjs";

const LOCAL_BASE = process.env.EVAL_LOCAL_BASE ?? "http://localhost:3000";
const PROD_BASE = process.env.EVAL_PROD_BASE ?? "https://app-red-phi-88.vercel.app";
const GENERATE_TIMEOUT_MS = 300_000;

const IMAGE_MODELS = [
  { key: "gemini-2.5-flash-image", label: "A (Gemini 2.5 image)" },
  { key: "gemini-3.1-flash-image-preview", label: "B (Gemini 3.1 image)" },
];

// Must match TEXT_MODEL_IDS in app/lib/gemini.ts. Kept as a literal list so an
// unknown id aborts here rather than being silently coerced to the default by
// the route's allowlist — a run against a different model than requested would
// produce plausible-looking but mislabelled eval data.
const TEXT_MODELS = ["gemini-3-flash-preview", "gemini-3.6-flash", "gemini-3.7-flash"];

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith("--only="))?.slice(7).split(",");
const all = args.includes("--all");
const retryFailed = args.includes("--retry-failed");
const textModels = args.find((a) => a.startsWith("--text-models="))?.slice(14).split(",");
const imageModelsArg = args.find((a) => a.startsWith("--image-models="))?.slice(15).split(",");
const unknown = args.filter(
  (a) =>
    !a.startsWith("--only=") &&
    !a.startsWith("--text-models=") &&
    !a.startsWith("--image-models=") &&
    a !== "--all" &&
    a !== "--retry-failed"
);
if (unknown.length || (!only && !all && !retryFailed)) {
  console.error(
    "Usage: node generate-restyled.mjs (--only=<id>[,<id>...] | --all | --retry-failed)\n" +
      "                                 [--text-models=<id>[,<id>...]] [--image-models=<id>[,<id>...]]"
  );
  process.exit(1);
}

const badText = (textModels ?? []).filter((m) => !TEXT_MODELS.includes(m));
if (badText.length) {
  console.error(`Unknown text model(s): ${badText.join(", ")}\nValid: ${TEXT_MODELS.join(", ")}`);
  process.exit(1);
}
const badImage = (imageModelsArg ?? []).filter((m) => !IMAGE_MODELS.some((c) => c.key === m));
if (badImage.length) {
  console.error(`Unknown image model(s): ${badImage.join(", ")}\nValid: ${IMAGE_MODELS.map((c) => c.key).join(", ")}`);
  process.exit(1);
}

const activeImageModels = imageModelsArg
  ? IMAGE_MODELS.filter((c) => imageModelsArg.includes(c.key))
  : IMAGE_MODELS;

// Without --text-models the tool behaves exactly as before: one config per image
// model, keyed by the image-model id, so the 68 pre-existing records still
// resume correctly. With --text-models, configs become the cross product and are
// keyed "<textModel>|<imageModel>" so the two schemes never collide.
const CONFIGS = textModels
  ? textModels.flatMap((tm) =>
      activeImageModels.map((im) => ({
        key: `${tm}|${im.key}`,
        label: `${tm} + ${im.label}`,
        textModel: tm,
        imageModel: im.key,
      }))
    )
  : activeImageModels.map((im) => ({ key: im.key, label: im.label, textModel: undefined, imageModel: im.key }));

const { sources, standardPrompt } = JSON.parse(fs.readFileSync(SOURCES_PATH, "utf8"));

async function scrapeStructure(responderUrl) {
  const res = await fetch(`${LOCAL_BASE}/api/scrape`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: responderUrl }),
  });
  const j = await res.json();
  if (!res.ok || j.error) throw new Error(`scrape failed: ${j.error ?? res.status}`);
  return j.structure ?? j;
}

async function generate(structure, styleGuideBase64, imageModel, textModel) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS);
  try {
    const res = await fetch(`${LOCAL_BASE}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        structure,
        prompt: standardPrompt,
        history: [],
        previousHtml: "",
        styleGuide: { imageBase64: styleGuideBase64, focusNote: "" },
        imageModel,
        ...(textModel ? { textModel } : {}),
      }),
    });
    if (!res.ok) throw new Error(`generate HTTP ${res.status}`);

    // Parse the SSE stream; the last meaningful event is result or error.
    const decoder = new TextDecoder();
    let buffer = "";
    let result = null;
    const steps = [];
    for await (const chunk of res.body) {
      buffer += decoder.decode(chunk, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const data = block
          .split("\n")
          .filter((l) => l.startsWith("data: "))
          .map((l) => l.slice(6))
          .join("");
        if (!data) continue;
        const evt = JSON.parse(data);
        if (evt.type === "step") {
          steps.push(`${evt.step}/${evt.status}`);
          process.stdout.write(`      ${evt.step}: ${evt.status}${evt.detail ? ` (${String(evt.detail).slice(0, 60)})` : ""}\n`);
        } else if (evt.type === "result") {
          result = evt;
        } else if (evt.type === "error") {
          throw new Error(`generation error: ${evt.message}`);
        }
      }
    }
    if (!result?.html) throw new Error(`stream ended without result (steps: ${steps.join(", ")})`);
    return result;
  } finally {
    clearTimeout(timer);
  }
}

async function publishAndExtend(html, structure, generatedImages) {
  // The generated HTML bakes the LOCAL submit URL — rewrite to prod before publishing.
  const rewritten = html.replaceAll(`${LOCAL_BASE}/api/submit/`, `${PROD_BASE}/api/submit/`);
  if (rewritten === html && !html.includes(`${PROD_BASE}/api/submit/`)) {
    throw new Error("submit URL not found in generated HTML — rewrite would leave submissions broken");
  }
  const pubRes = await fetch(`${PROD_BASE}/api/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      html: rewritten,
      formId: structure.formId,
      imageKeys: (generatedImages ?? []).map((i) => i.key).filter(Boolean),
    }),
  });
  const pub = await pubRes.json();
  if (!pubRes.ok || pub.error) throw new Error(`publish failed: ${pub.error ?? pubRes.status}`);

  const extRes = await fetch(`${PROD_BASE}/api/forms/${pub.id}/extend`, { method: "POST" });
  const ext = await extRes.json();
  if (!extRes.ok || ext.error) throw new Error(`extend failed for ${pub.id}: ${ext.error ?? extRes.status}`);

  return { url: pub.url, id: pub.id, expiresAt: ext.expiresAt };
}

let ok = 0,
  failed = 0;

for (const source of sources) {
  if (source.skip) continue;
  if (only && !only.includes(source.id)) continue;

  const item = getItem(source);
  if (item.stages.verify !== "done" || !item.form?.responderUrl) {
    console.log(`- ${source.id}: eval form not ready, skipping`);
    continue;
  }
  const screenshotFile = path.join(STYLE_GUIDES_DIR, `${source.id}.png`);
  if (!fs.existsSync(screenshotFile)) {
    console.log(`- ${source.id}: no style guide screenshot, skipping`);
    continue;
  }

  item.generated ??= {};
  const pending = CONFIGS.filter((c) => {
    const g = item.generated[c.key];
    if (retryFailed) return g?.status === "failed";
    return g?.status !== "done";
  });
  if (pending.length === 0) {
    console.log(`✓ ${source.id} — all ${CONFIGS.length} config(s) already generated`);
    ok++;
    continue;
  }

  console.log(`\n=== ${source.id} (${source.business} — ${source.formType}) ===`);
  const styleGuideBase64 = `data:image/png;base64,${fs.readFileSync(screenshotFile).toString("base64")}`;

  let structure;
  try {
    structure = await scrapeStructure(item.form.responderUrl);
  } catch (err) {
    console.error(`  scrape: FAILED — ${err.message}`);
    for (const c of pending) {
      item.generated[c.key] = { status: "failed", error: `scrape: ${err.message}`, at: new Date().toISOString() };
    }
    saveItem(item);
    failed++;
    continue;
  }

  let itemFailed = false;
  for (const config of pending) {
    console.log(`  config ${config.label}:`);
    try {
      const t0 = Date.now();
      const result = await generate(structure, styleGuideBase64, config.imageModel, config.textModel);
      const published = await publishAndExtend(result.html, structure, result.generatedImages);
      item.generated[config.key] = {
        status: "done",
        textModel: config.textModel,
        imageModel: config.imageModel,
        url: published.url,
        publishId: published.id,
        expiresAt: published.expiresAt,
        imageCount: result.generatedImages?.length ?? 0,
        imageErrors: result.imageErrors?.length ? result.imageErrors : undefined,
        htmlLength: result.html.length,
        durationMs: Date.now() - t0,
        at: new Date().toISOString(),
      };
      saveItem(item);
      console.log(`    done — ${published.url} (expires ${published.expiresAt?.slice(0, 10)}, ${item.generated[config.key].imageCount} images)`);
    } catch (err) {
      item.generated[config.key] = { status: "failed", error: err.message, at: new Date().toISOString() };
      saveItem(item);
      console.error(`    FAILED — ${err.message}`);
      itemFailed = true;
    }
  }
  itemFailed ? failed++ : ok++;
}

console.log(`\n=== Generation summary: ${ok} items ok, ${failed} with failures ===`);
