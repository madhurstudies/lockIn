import { NextResponse } from "next/server";
import { addTag, getTags } from "@/lib/store";

export async function GET() {
  return NextResponse.json(await getTags());
}

export async function POST(req: Request) {
  const { name, color } = await req.json().catch(() => ({}));
  try {
    return NextResponse.json(await addTag(name, color));
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
