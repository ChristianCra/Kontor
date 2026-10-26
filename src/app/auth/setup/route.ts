import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, sessionCookie } from "@/lib/auth";
import { NewUser } from "@/lib/users";

// Ersteinrichtung: nur möglich, solange es noch keinen Benutzer gibt
export async function POST(req: NextRequest) {
  const back = (msg: string) => NextResponse.redirect(new URL(`/login?fehler=${encodeURIComponent(msg)}`, req.url), 303);
  if (await db.user.count()) return back("Die Einrichtung ist bereits abgeschlossen.");
  const r = NewUser.safeParse(Object.fromEntries((await req.formData()).entries()));
  if (!r.success) return back(r.error.issues[0].message);
  const { name, email, password } = r.data;
  const user = await db.user.create({ data: { name, email, passwordHash: await hashPassword(password) } });
  const res = NextResponse.redirect(new URL("/", req.url), 303);
  const c = await sessionCookie(user);
  res.cookies.set(c.name, c.value, c.options);
  return res;
}
