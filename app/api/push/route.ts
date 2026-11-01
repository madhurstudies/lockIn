import { NextResponse } from "next/server";
import { addSubscription, publicKey } from "@/lib/alarm";

/** VAPID public key, or null when push isn't configured. */
export async function GET() {
  return NextResponse.json({ key: publicKey });
}

export async function POST(req: Request) {
  try {
    await addSubscription(await req.json());
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
