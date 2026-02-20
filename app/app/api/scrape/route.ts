import { NextRequest, NextResponse } from "next/server";
import { scrapeForm } from "@/lib/scraper";

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    if (!url.includes("docs.google.com/forms")) {
      return NextResponse.json(
        { error: "Please provide a valid Google Form URL" },
        { status: 400 }
      );
    }

    const structure = await scrapeForm(url);
    return NextResponse.json({ structure });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load form";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
