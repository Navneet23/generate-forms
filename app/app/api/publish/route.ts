import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { save } from "@/lib/store";

export async function POST(req: NextRequest) {
  try {
    const { html, formId }: { html: string; formId: string } = await req.json();

    if (!html || !formId) {
      return NextResponse.json(
        { error: "html and formId are required" },
        { status: 400 }
      );
    }

    const id = nanoid(10);
    await save(id, { html, formId, createdAt: new Date().toISOString() });

    const url = `${req.nextUrl.origin}/f/${id}`;
    return NextResponse.json({ url, id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Publish failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
