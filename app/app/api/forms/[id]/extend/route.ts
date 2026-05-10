import { NextRequest, NextResponse } from "next/server";
import { extendForm } from "@/lib/store";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const record = await extendForm(id);
    if (!record) {
      return NextResponse.json({ error: "Form not found" }, { status: 404 });
    }
    return NextResponse.json({
      expiresAt: record.expiresAt,
      extended: record.extended,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Extend failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
