import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { clearLoginFailures, loginBlocked, recordLoginFailure, sessionCookie, verifyPassword } from "@/lib/auth";

// Anmeldung als normaler Formular-POST (kein Server-Action), damit die Middleware alle Actions schützen kann

// Nur interne Weiterleitungen zulassen
const safeNext = (s: FormDataEntryValue | null) => (typeof s === "string" && s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : "/");

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = safeNext(form.get("weiter"));
  const back = (msg: string) => {
    const url = new URL("/login", req.url);
    url.searchParams.set("fehler", msg);
    if (next !== "/") url.searchParams.set("weiter", next);
    return NextResponse.redirect(url, 303);
  };
  if (loginBlocked(email)) return back("Zu viele Fehlversuche. Bitte in einer Minute erneut versuchen.");
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    recordLoginFailure(email);
    return back("E-Mail oder Passwort ist falsch.");
  }
  clearLoginFailures(email);
  const res = NextResponse.redirect(new URL(next, req.url), 303);
  const c = await sessionCookie(user);
  res.cookies.set(c.name, c.value, c.options);
  return res;
}
