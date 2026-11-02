import { NextResponse } from "next/server";
import { sanitize } from "@/lib/constraints";
import { getConstraints, saveConstraints } from "@/lib/store";

export async function GET() {
  return NextResponse.json(await getConstraints());
}

export async function PUT(req: Request) {
  const list = sanitize(await req.json().catch(() => null));
  if (!list) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  return NextResponse.json(await saveConstraints(list));
}
