import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import { join } from "path";
import { nanoid } from "nanoid";

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("image");

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json(
        { error: "Unsupported file type. Use JPG, PNG, GIF, WebP or SVG." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    if (buffer.byteLength > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Image must be under 10 MB" },
        { status: 400 }
      );
    }

    // Sanitise extension from MIME type — never trust the filename
    const ext = file.type.split("/")[1].replace("jpeg", "jpg").replace("svg+xml", "svg");
    const filename = `${nanoid()}.${ext}`;
    const uploadDir = join(process.cwd(), "public", "uploads");
    await writeFile(join(uploadDir, filename), buffer);

    const url = `${req.nextUrl.origin}/uploads/${filename}`;
    return NextResponse.json({ url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Upload failed";
    console.error("Upload error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
