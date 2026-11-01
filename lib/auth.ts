import { createHash, createHmac, scryptSync, timingSafeEqual } from "node:crypto";

export const COOKIE = "lockin";
export const MAX_AGE = 60 * 60 * 24 * 30;

const digest = (s: string) => createHash("sha256").update(s).digest();
const sig = (payload: string) =>
  createHmac("sha256", process.env.SESSION_SECRET!).update(payload).digest("base64url");

/** AUTH_PASSWORD_HASH is `salt:hash`, both hex, scrypt(password, salt, 64). */
export function checkCredentials(user: string, pass: string): boolean {
  const [salt, hash] = (process.env.AUTH_PASSWORD_HASH ?? "").split(":");
  if (!salt || !hash) return false;
  // always run both checks so timing doesn't reveal which field was wrong
  const userOk = timingSafeEqual(digest(user), digest(process.env.AUTH_USERNAME ?? ""));
  const want = Buffer.from(hash, "hex");
  const passOk = timingSafeEqual(scryptSync(pass, salt, want.length), want);
  return userOk && passOk;
}

export function makeSession(): string {
  const payload = String(Date.now() + MAX_AGE * 1000);
  return `${payload}.${sig(payload)}`;
}

export function validSession(token?: string): boolean {
  if (!token || !process.env.SESSION_SECRET) return false;
  const [payload, mac = ""] = token.split(".");
  const a = Buffer.from(mac), b = Buffer.from(sig(payload));
  return a.length === b.length && timingSafeEqual(a, b) && Number(payload) > Date.now();
}
