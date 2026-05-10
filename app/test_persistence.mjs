// Verifies the persisted-forms flow against a running dev server.
// Usage:
//   1. In one terminal: `npm run dev`
//   2. In another:      `node test_persistence.mjs`
//
// Optionally override the target with TEST_BASE_URL=https://... node test_persistence.mjs
//
// Sweeper checks live in a runbook section at the bottom of this file —
// they require a real Vercel Blob bucket and CRON_SECRET, so they are not
// scripted here.

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const DAY_MS = 24 * 60 * 60 * 1000;

function daysFromNow(iso) {
  return (new Date(iso).getTime() - Date.now()) / DAY_MS;
}

function expect(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`✓ ${msg}`);
}

async function main() {
  // 1. Publish a form
  const publishRes = await fetch(`${BASE}/api/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      html: "<html><body>test</body></html>",
      formId: "test-form",
    }),
  });
  const publish = await publishRes.json();
  expect(publishRes.ok, `publish responds 200 (got ${publishRes.status})`);
  expect(
    typeof publish.id === "string" && publish.id.length === 10,
    "publish returns 10-char id"
  );
  expect(typeof publish.expiresAt === "string", "publish returns expiresAt");
  const days = daysFromNow(publish.expiresAt);
  expect(
    days > 29 && days < 31,
    `expiresAt is ~30 days out (got ${days.toFixed(2)})`
  );

  const id = publish.id;

  // 2. Extend
  const extRes = await fetch(`${BASE}/api/forms/${id}/extend`, {
    method: "POST",
  });
  const ext = await extRes.json();
  expect(extRes.ok, `extend responds 200 (got ${extRes.status})`);
  expect(ext.extended === true, "extend returns extended: true");
  const extDays = daysFromNow(ext.expiresAt);
  expect(
    extDays > 364 && extDays < 366,
    `expiresAt is ~365 days out (got ${extDays.toFixed(2)})`
  );

  // 3. Second extend is idempotent
  const ext2Res = await fetch(`${BASE}/api/forms/${id}/extend`, {
    method: "POST",
  });
  const ext2 = await ext2Res.json();
  expect(ext2Res.ok, "second extend responds 200");
  expect(
    ext2.expiresAt === ext.expiresAt,
    "second extend returns same expiresAt"
  );

  // 4. 404 on bogus id
  const bogusRes = await fetch(`${BASE}/api/forms/bogus-id-xx/extend`, {
    method: "POST",
  });
  expect(
    bogusRes.status === 404,
    `extend on missing id returns 404 (got ${bogusRes.status})`
  );

  console.log("\nAll persistence checks passed.");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

// --- Sweeper runbook (manual) -------------------------------------------
// Prerequisites: a Vercel Blob bucket, CRON_SECRET set in the environment.
//
// 1. Publish a form with images (UI flow with image model enabled).
//    Confirm `imageKeys` on the Redis record matches the actual blob keys
//    (e.g. via `redis-cli GET <id>` against the Upstash REST URL, or by
//    GET /f/<id> and inspecting the embedded image URLs).
//
// 2. Force-expire the form record:
//      redis-cli DEL <id>
//    Then call the sweeper:
//      curl -H "Authorization: Bearer $CRON_SECRET" \
//           https://<deployment>/api/cron/sweep-blobs
//    The response should report deleted >= the form's image count.
//    Confirm the blobs are gone via Vercel dashboard.
//
// 3. Negative test: publish a form, run the sweeper without expiring.
//    The form's blobs must NOT be deleted (response shows skippedInUse).
//
// 4. Safety-window test: upload a new blob (any flow) and immediately
//    run the sweeper. The new blob must NOT be deleted (skippedFresh).
