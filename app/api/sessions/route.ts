import { NextResponse } from "next/server";
import { getSessions } from "@/lib/store";

/** Finished sessions overlapping [from, to] (ms epoch). */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const from = Number(q.get("from") ?? 0);
  const to = Number(q.get("to") ?? Date.now());
  const all = await getSessions();
  return NextResponse.json(all.filter((s) => s.endedAt! >= from && s.startedAt <= to));
}
