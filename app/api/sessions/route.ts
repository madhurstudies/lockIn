import { NextResponse } from "next/server";
import { deleteSession, editEnd, getSessions } from "@/lib/store";

/** Finished sessions overlapping [from, to] (ms epoch). */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const from = Number(q.get("from") ?? 0);
  const to = Number(q.get("to") ?? Date.now());
  const all = await getSessions();
  return NextResponse.json(all.filter((s) => s.endedAt! >= from && s.startedAt <= to));
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  return (await deleteSession(id))
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "Not found" }, { status: 404 });
}

/** Move a session's end earlier: { id, endedAt }. The start can't be edited and the end can't move later. */
export async function PATCH(req: Request) {
  const b = (await req.json().catch(() => null)) as { id?: unknown; endedAt?: unknown } | null;
  if (!b || typeof b.id !== "string") return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const edited = await editEnd(b.id, b.endedAt);
  if (edited) return NextResponse.json(edited);
  const known = (await getSessions()).some((s) => s.id === b.id);
  return NextResponse.json({ error: known ? "Bad request" : "Not found" }, { status: known ? 400 : 404 });
}
