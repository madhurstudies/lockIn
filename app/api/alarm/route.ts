import { NextResponse } from "next/server";
import { scheduleAlarm, sendDone, verify } from "@/lib/alarm";
import { expireIfDue, getActive } from "@/lib/store";

/** Called by QStash when a countdown should end. Public in proxy.ts; the QStash signature is the auth. */
export async function POST(req: Request) {
  const body = await req.text();
  if (!(await verify(req.headers.get("upstash-signature"), body)))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = (JSON.parse(body) as { id?: unknown }).id;
  if (typeof id !== "string") return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const done = await expireIfDue(id);
  if (done === "early") await scheduleAlarm(await getActive(), new URL(req.url).origin);
  else if (done) await sendDone(done);
  return NextResponse.json({ ok: true });
}
