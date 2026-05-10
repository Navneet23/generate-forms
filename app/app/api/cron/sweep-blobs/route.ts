import { NextRequest, NextResponse } from "next/server";
import { list, del } from "@vercel/blob";
import { listAllImageKeys } from "@/lib/store";

// Skip blobs uploaded within this window — protects in-flight publishes
// whose form record has not yet been written.
const SAFETY_WINDOW_MS = 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const inUse = await listAllImageKeys();
  const cutoff = Date.now() - SAFETY_WINDOW_MS;

  let scanned = 0;
  let deleted = 0;
  let skippedFresh = 0;
  let skippedInUse = 0;
  const errors: string[] = [];

  let cursor: string | undefined = undefined;
  do {
    const page: { blobs: { url: string; pathname: string; uploadedAt: Date }[]; cursor?: string } =
      await list({ cursor, limit: 1000 });
    for (const blob of page.blobs) {
      scanned++;
      if (inUse.has(blob.pathname)) {
        skippedInUse++;
        continue;
      }
      if (new Date(blob.uploadedAt).getTime() > cutoff) {
        skippedFresh++;
        continue;
      }
      try {
        await del(blob.url);
        deleted++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${blob.pathname}: ${msg}`);
      }
    }
    cursor = page.cursor;
  } while (cursor);

  console.log(
    `[SWEEP] scanned=${scanned} deleted=${deleted} skippedInUse=${skippedInUse} skippedFresh=${skippedFresh} errors=${errors.length}`
  );

  return NextResponse.json({
    scanned,
    deleted,
    skippedInUse,
    skippedFresh,
    errors: errors.length > 0 ? errors : undefined,
  });
}
