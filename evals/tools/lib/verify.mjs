// Stage 5: confirm the published form is scrapable by the app — the responder
// page must expose FB_PUBLIC_LOAD_DATA_ to an unauthenticated fetch and contain
// every question we created.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

/**
 * Candidate encodings of a question text as it may appear in the page.
 * Google's inline JSON escapes &, <, > as &, <, >; HTML contexts
 * may use &amp; — accept any of them.
 */
function candidates(s) {
  const json = JSON.stringify(s).slice(1, -1);
  return [
    s,
    json,
    json.replace(/&/g, "\\u0026").replace(/</g, "\\u003c").replace(/>/g, "\\u003e"),
    s.replace(/&/g, "&amp;"),
  ];
}

export async function verifyPublishedForm(responderUrl, structure) {
  const res = await fetch(responderUrl, { headers: { "User-Agent": UA }, redirect: "follow" });
  if (!res.ok) throw new Error(`responder URL returned HTTP ${res.status}`);
  const html = await res.text();

  if (html.includes("accounts.google.com") && !html.includes("FB_PUBLIC_LOAD_DATA_")) {
    throw new Error("responder page redirects to login — form is not public");
  }
  if (!html.includes("FB_PUBLIC_LOAD_DATA_")) {
    throw new Error("FB_PUBLIC_LOAD_DATA_ not found — app scraper would fail on this form");
  }

  const missing = structure.questions
    .map((q) => q.text)
    .filter((text) => !candidates(text).some((c) => html.includes(c)));
  if (missing.length > 0) {
    throw new Error(
      `${missing.length}/${structure.questions.length} question(s) missing from public payload: ` +
        missing.map((t) => `"${t.slice(0, 50)}"`).join(", ")
    );
  }
  return { verifiedQuestions: structure.questions.length };
}
