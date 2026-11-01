import { after, NextResponse } from "next/server";
import { scheduleAlarm } from "@/lib/alarm";
import { act, getActive, type Action } from "@/lib/store";

export async function GET() {
  const now = Date.now();
  return NextResponse.json({ now, active: await getActive(now) });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Action | null;
  if (!body || !["start", "pause", "resume", "stop"].includes(body.action))
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const now = Date.now();
  try {
    const active = await act(body, now);
    if (body.action === "start" || body.action === "resume") after(() => scheduleAlarm(active, new URL(req.url).origin, now));
    return NextResponse.json({ now, active });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
