import { NextRequest, NextResponse } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ formId: string }> }
) {
  try {
    const { formId } = await params;
    const body: Record<string, string> = await req.json();

    const formData = new URLSearchParams();
    for (const [key, value] of Object.entries(body)) {
      formData.append(key, value);
    }
    // Tell Google not to redirect to the confirmation page
    formData.append("submit", "Submit");

    const googleUrl = `https://docs.google.com/forms/d/e/${formId}/formResponse`;

    const googleRes = await fetch(googleUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
      redirect: "manual", // treat 302 as success
    });

    // Google returns 200 or 302 on success
    if (googleRes.status === 200 || googleRes.status === 302) {
      return NextResponse.json({ status: "ok" });
    }

    console.error("Google Forms submission unexpected status:", googleRes.status);
    return NextResponse.json(
      { error: "Submission failed. Please try again." },
      { status: 500 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Submission error";
    console.error("Submission proxy error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
