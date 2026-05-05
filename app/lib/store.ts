import { Redis } from "@upstash/redis";

export interface PublishedForm {
  html: string;
  formId: string;
  createdAt: string;
  expiresAt: string;
  extended: boolean;
  imageKeys: string[];
}

export type SavePublishedFormInput = Omit<
  PublishedForm,
  "expiresAt" | "extended" | "imageKeys"
> & {
  imageKeys?: string[];
};

const redis = new Redis({
  url: (process.env.publish_KV_REST_API_URL ?? process.env.KV_REST_API_URL)!,
  token: (process.env.publish_KV_REST_API_TOKEN ?? process.env.KV_REST_API_TOKEN)!,
});

const TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const EXTENDED_TTL_SECONDS = 365 * 24 * 60 * 60; // 1 year
// Used only to derive expiresAt for pre-feature records that lack the field.
const LEGACY_TTL_SECONDS = 7 * 24 * 60 * 60;

export async function save(
  id: string,
  input: SavePublishedFormInput
): Promise<PublishedForm> {
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000).toISOString();
  const record: PublishedForm = {
    html: input.html,
    formId: input.formId,
    createdAt: input.createdAt,
    imageKeys: input.imageKeys ?? [],
    expiresAt,
    extended: false,
  };
  await redis.set(id, JSON.stringify(record), { ex: TTL_SECONDS });
  return record;
}

export async function extendForm(id: string): Promise<PublishedForm | null> {
  const record = await get(id);
  if (!record) return null;
  if (record.extended) return record;

  const expiresAt = new Date(
    Date.now() + EXTENDED_TTL_SECONDS * 1000
  ).toISOString();
  const updated: PublishedForm = { ...record, extended: true, expiresAt };
  await redis.set(id, JSON.stringify(updated), { ex: EXTENDED_TTL_SECONDS });
  return updated;
}

export async function listAllImageKeys(): Promise<Set<string>> {
  const keys = new Set<string>();
  let cursor = "0";
  do {
    const result: [string, string[]] = await redis.scan(cursor, {
      match: "*",
      count: 100,
    });
    cursor = result[0];
    const batch = result[1];
    if (batch.length > 0) {
      const records = await Promise.all(batch.map((id) => get(id)));
      for (const r of records) {
        if (!r) continue;
        for (const k of r.imageKeys) keys.add(k);
      }
    }
  } while (cursor !== "0");
  return keys;
}

export async function get(id: string): Promise<PublishedForm | null> {
  const data = await redis.get<string>(id);
  if (!data) return null;
  const raw = (typeof data === "object"
    ? data
    : JSON.parse(data)) as Partial<PublishedForm>;

  const createdAt = raw.createdAt ?? new Date().toISOString();
  const expiresAt =
    raw.expiresAt ??
    new Date(
      new Date(createdAt).getTime() + LEGACY_TTL_SECONDS * 1000
    ).toISOString();

  return {
    html: raw.html ?? "",
    formId: raw.formId ?? "",
    createdAt,
    expiresAt,
    extended: raw.extended ?? false,
    imageKeys: raw.imageKeys ?? [],
  };
}
