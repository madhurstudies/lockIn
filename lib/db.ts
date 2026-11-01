import { Redis } from "@upstash/redis";

const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

// Local dev without Upstash creds: in-process memory. Not durable, never used on Vercel.
const mem = new Map<string, unknown>();
const redis = url && token ? new Redis({ url, token }) : null;

if (!redis && process.env.VERCEL) throw new Error("Upstash Redis env vars missing");

export async function get<T>(key: string): Promise<T | null> {
  return redis ? redis.get<T>(key) : ((mem.get(key) as T) ?? null);
}

export async function set(key: string, value: unknown) {
  if (redis) await redis.set(key, value);
  else mem.set(key, value);
}

/** Increment a counter that expires `ttl` seconds after its first hit. */
export async function hit(key: string, ttl: number): Promise<number> {
  if (redis) {
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, ttl);
    return n;
  }
  const n = ((mem.get(key) as number) ?? 0) + 1;
  mem.set(key, n);
  return n;
}

export async function clear(key: string) {
  if (redis) await redis.del(key);
  else mem.delete(key);
}
