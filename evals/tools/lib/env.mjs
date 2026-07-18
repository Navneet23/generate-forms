import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const TOOLS_DIR = path.resolve(__dirname, "..");
export const EVALS_DIR = path.resolve(TOOLS_DIR, "..");
export const REPO_ROOT = path.resolve(EVALS_DIR, "..");
export const CREDENTIALS_DIR = path.join(TOOLS_DIR, "credentials");
export const STYLE_GUIDES_DIR = path.join(EVALS_DIR, "style-guides");
export const MANIFEST_PATH = path.join(EVALS_DIR, "manifest.json");
export const SOURCES_PATH = path.join(EVALS_DIR, "sources.json");

/** Reads GEMINI_API_KEY from app/.env.local (same key the app uses). */
export function getGeminiApiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const envPath = path.join(REPO_ROOT, "app", ".env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error(`GEMINI_API_KEY not set and ${envPath} not found`);
  }
  const line = fs
    .readFileSync(envPath, "utf8")
    .split("\n")
    .find((l) => l.trim().startsWith("GEMINI_API_KEY="));
  if (!line) throw new Error(`GEMINI_API_KEY not found in ${envPath}`);
  return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}
