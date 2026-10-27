import { createHash } from "node:crypto";
import { db } from "./db";

// Wer eine Änderung auslöst: ein angemeldeter Benutzer, ein API-Schlüssel (z. B. Claude) oder Kontor selbst
export type Actor = { type: "user" | "token" | "system"; name: string; userId?: number; tokenId?: number; scopes?: string[] };

export type AuditEntry = { actorType: string; actorName: string; action: string; entity: string; entityId: number | null; detail: string; createdAt: Date };

const GENESIS = "0".repeat(64);

export function entryHash(prevHash: string, e: AuditEntry): string {
  return createHash("sha256")
    .update([prevHash, e.createdAt.toISOString(), e.actorType, e.actorName, e.action, e.entity, e.entityId ?? "", e.detail].join("|"))
    .digest("hex");
}

// Schreibzugriffe nacheinander abarbeiten, damit die Hash-Kette auch bei parallelen Anfragen lückenlos bleibt
let queue: Promise<unknown> = Promise.resolve();

export function audit(actor: Actor, action: string, entity = "", entityId: number | null = null, detail: unknown = {}) {
  const run = queue.then(async () => {
    const last = await db.auditLog.findFirst({ orderBy: { id: "desc" } });
    const prevHash = last?.hash ?? GENESIS;
    const entry: AuditEntry = { actorType: actor.type, actorName: actor.name, action, entity, entityId, detail: JSON.stringify(detail ?? {}), createdAt: new Date() };
    await db.auditLog.create({ data: { ...entry, prevHash, hash: entryHash(prevHash, entry) } });
  });
  queue = run.catch(() => undefined);
  return run;
}

// Prüft die gesamte Kette; liefert die erste Zeile, deren Hash oder Verkettung nicht stimmt
export async function verifyAuditChain(): Promise<{ ok: true; count: number } | { ok: false; brokenAt: number }> {
  const rows = await db.auditLog.findMany({ orderBy: { id: "asc" } });
  let prev = GENESIS;
  for (const r of rows) {
    if (r.prevHash !== prev || entryHash(prev, r) !== r.hash) return { ok: false, brokenAt: r.id };
    prev = r.hash;
  }
  return { ok: true, count: rows.length };
}
