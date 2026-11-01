import { NextResponse } from "next/server";
import { checkCredentials, COOKIE, MAX_AGE, makeSession } from "@/lib/auth";
import { clear, hit } from "@/lib/db";

const LIMIT = 5;
const WINDOW = 15 * 60;

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  const key = `login:${ip}`;
  if ((await hit(key, WINDOW)) > LIMIT)
    return NextResponse.json({ error: "Too many attempts. Try later." }, { status: 429 });

  const { username, password } = await req.json().catch(() => ({}));
  if (typeof username !== "string" || typeof password !== "string" || !checkCredentials(username, password))
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });

  await clear(key);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, makeSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
  return res;
}
