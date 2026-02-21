import { NextRequest, NextResponse } from "next/server";
import { lookup } from "dns/promises";

// Private IP ranges — block to prevent SSRF
const PRIVATE_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^::1$/,
  /^fc00:/,
  /^fd[0-9a-f]{2}:/i,
];

function isPrivateIp(ip: string): boolean {
  return PRIVATE_RANGES.some((r) => r.test(ip));
}

async function validateUrl(raw: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http and https URLs are allowed");
  }
  if (parsed.hostname === "localhost") {
    throw new Error("Private URLs are not allowed");
  }
  try {
    const { address } = await lookup(parsed.hostname);
    if (isPrivateIp(address)) throw new Error("Private URLs are not allowed");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "DNS lookup failed";
    throw new Error(msg);
  }
  return parsed.toString();
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    const safeUrl = await validateUrl(url);

    // Lazy import puppeteer so it only loads when this route is called
    const puppeteer = await import("puppeteer");
    const browser = await puppeteer.default.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.goto(safeUrl, { waitUntil: "networkidle2", timeout: 15000 });

      const screenshotBuffer = await page.screenshot({
        type: "png",
        clip: { x: 0, y: 0, width: 1280, height: 800 },
      });

      const base64 = `data:image/png;base64,${Buffer.from(screenshotBuffer).toString("base64")}`;
      return NextResponse.json({ imageBase64: base64 });
    } finally {
      await browser.close();
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Screenshot failed";
    const status = message.includes("timeout") ? 408 : message.includes("Private") || message.includes("Invalid") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
