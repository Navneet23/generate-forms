import { NextRequest } from "next/server";
import { get } from "@/lib/store";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const record = get(id);

  if (!record) {
    return new Response("<h1>Form not found</h1>", {
      status: 404,
      headers: { "Content-Type": "text/html" },
    });
  }

  return new Response(record.html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
