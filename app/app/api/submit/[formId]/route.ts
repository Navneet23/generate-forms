import { NextRequest, NextResponse } from "next/server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Handle preflight requests from srcdoc iframes (null origin)
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ formId: string }> }
) {
  try {
    const { formId } = await params;
    const body: Record<string, string | string[]> = await req.json();

    const formData = new URLSearchParams();
    for (const [key, value] of Object.entries(body)) {
      if (Array.isArray(value)) {
        // Checkboxes send multiple values for the same key
        for (const v of value) {
          formData.append(key, v);
        }
      } else if (value !== null && value !== undefined && value !== "") {
        formData.append(key, value);
      }
    }
    formData.append("submit", "Submit");

    const googleUrl = `https://docs.google.com/forms/d/e/${formId}/formResponse`;

    const googleRes = await fetch(googleUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
      redirect: "manual",
    });

    // Google Forms returns 200 on success, 302 on redirect-to-thanks page
    // Status 0 can happen with opaque redirects (redirect:"manual")
    if (googleRes.status === 200 || googleRes.status === 302 || googleRes.status === 0) {
      return NextResponse.json({ status: "ok" }, { headers: CORS_HEADERS });
    }

    const responseText = await googleRes.text().catch(() => "(unreadable)");
    console.error("Google Forms submission unexpected status:", googleRes.status, "body:", formData.toString().slice(0, 300), "response:", responseText.slice(0, 500));
    return NextResponse.json(
      { error: "Submission failed. Please try again.", googleStatus: googleRes.status, sentBody: formData.toString().slice(0, 500) },
      { status: 500, headers: CORS_HEADERS }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Submission error";
    console.error("Submission proxy error:", message);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
