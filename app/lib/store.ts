import { Redis } from "@upstash/redis";

export interface PublishedForm {
  html: string;
  formId: string;
  createdAt: string;
}

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export async function save(id: string, record: PublishedForm): Promise<void> {
  await redis.set(id, JSON.stringify(record), { ex: TTL_SECONDS });
}

export async function get(id: string): Promise<PublishedForm | null> {
  const data = await redis.get<string>(id);
  if (!data) return null;
  // Upstash may auto-parse JSON; handle both string and object
  if (typeof data === "object") return data as unknown as PublishedForm;
  return JSON.parse(data) as PublishedForm;
}
