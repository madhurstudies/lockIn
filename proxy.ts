import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, validSession } from "@/lib/auth";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname === "/api/login" || pathname === "/api/alarm") return NextResponse.next(); // alarm checks its QStash signature
  if (validSession(req.cookies.get(COOKIE)?.value)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.redirect(new URL("/login", req.url));
}

// Static assets and PWA files stay public; everything else is gated.
export const config = {
  matcher: ["/((?!_next/static|_next/image|manifest.webmanifest|sw.js|icons/|favicon.ico).*)"],
};
