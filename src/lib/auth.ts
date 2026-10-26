import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { SESSION_COOKIE, SESSION_DAYS, signSession, verifySession } from "./session-token";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const MIN_PASSWORD = 10;

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [algo, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(pw, Buffer.from(salt, "base64"), expected.length);
  return timingSafeEqual(actual, expected);
}

export async function sessionCookie(user: { id: number; sessionVersion: number }) {
  const expires = Date.now() + SESSION_DAYS * 86400000;
  const token = await signSession({ u: user.id, v: user.sessionVersion, e: expires });
  const proto = (await headers()).get("x-forwarded-proto");
  return {
    name: SESSION_COOKIE,
    value: token,
    options: { httpOnly: true, sameSite: "lax" as const, secure: proto === "https", path: "/", expires: new Date(expires) },
  };
}

export async function startSession(user: { id: number; sessionVersion: number }) {
  const c = await sessionCookie(user);
  (await cookies()).set(c.name, c.value, c.options);
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

// Angemeldeter Benutzer; prüft zusätzlich zur Signatur die Sitzungsversion (Abmeldung nach Passwortwechsel)
export async function getCurrentUser() {
  const p = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!p) return null;
  const user = await db.user.findUnique({ where: { id: p.u } });
  return user && user.sessionVersion === p.v ? user : null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

// Einfache Bremse gegen Passwort-Raten: nach 5 Fehlversuchen 60 Sekunden Sperre je E-Mail-Adresse
const failures = new Map<string, { count: number; until: number }>();

export function loginBlocked(email: string): boolean {
  const f = failures.get(email);
  return !!f && f.count >= 5 && f.until > Date.now();
}

export function recordLoginFailure(email: string) {
  const f = failures.get(email) ?? { count: 0, until: 0 };
  f.count = f.until && f.until < Date.now() ? 1 : f.count + 1;
  f.until = Date.now() + 60000;
  failures.set(email, f);
}

export function clearLoginFailures(email: string) {
  failures.delete(email);
}
