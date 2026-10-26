import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session-token";

// Alle Seiten, Server-Actions und Downloads erfordern eine gültige Sitzung.
// Frei zugänglich sind nur die Anmeldeseite und die Formular-Endpunkte unter /auth.
export async function middleware(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();
  // Server-Actions lassen sich an jede Seite senden, deshalb unabhängig vom Pfad sperren
  if (req.headers.has("next-action")) return new NextResponse("Nicht angemeldet", { status: 401 });
  const { pathname, search } = req.nextUrl;
  if ((pathname === "/login" && req.method === "GET") || (pathname.startsWith("/auth/") && req.method === "POST")) return NextResponse.next();
  if (req.method !== "GET") return new NextResponse("Nicht angemeldet", { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?weiter=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
