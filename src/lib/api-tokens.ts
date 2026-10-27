import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";
import type { Actor } from "./audit";

export const SCOPES = {
  read: "Lesen: Belege, Umsätze, offene Posten, Berichte",
  draft: "Entwürfe anlegen, Dateien hochladen und Buchungen zur Freigabe vorschlagen",
  book: "Belege buchen und Umsätze zuordnen ohne Freigabe",
} as const;

export type Scope = keyof typeof SCOPES;

export const isScope = (s: string): s is Scope => s in SCOPES;

export function parseScopes(s: string): Scope[] {
  return [...new Set(s.split(/[\s,]+/).filter(isScope))];
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createApiToken(name: string, scopes: Scope[], userId: number | null, clientId: string | null = null) {
  if (!scopes.includes("read")) scopes = ["read", ...scopes];
  const token = `kontor_${randomBytes(32).toString("base64url")}`;
  const row = await db.apiToken.create({
    data: { name, prefix: token.slice(0, 14), tokenHash: hashToken(token), scopes: scopes.join(","), userId, clientId },
  });
  return { token, row };
}

// Liefert den Akteur zu einem Bearer-Token oder null, wenn er unbekannt oder widerrufen ist
export async function actorFromBearer(header: string | null): Promise<Actor | null> {
  const m = header?.match(/^Bearer\s+(\S+)$/i);
  if (!m) return null;
  const row = await db.apiToken.findUnique({ where: { tokenHash: hashToken(m[1]) } });
  if (!row || row.revokedAt) return null;
  // lastUsedAt höchstens minütlich schreiben
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60000) {
    await db.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
  }
  return { type: "token", name: row.name, tokenId: row.id, userId: row.userId ?? undefined, scopes: parseScopes(row.scopes) };
}
