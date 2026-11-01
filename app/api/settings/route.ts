import { NextResponse } from "next/server";
import { sanitize } from "@/lib/settings";
import { getSettings, saveSettings } from "@/lib/store";

export async function GET() {
  return NextResponse.json(await getSettings());
}

export async function PUT(req: Request) {
  const patch = sanitize(await req.json().catch(() => null));
  if (!patch) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  return NextResponse.json(await saveSettings(patch));
}
