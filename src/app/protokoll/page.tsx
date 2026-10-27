import { db } from "@/lib/db";
import { verifyAuditChain } from "@/lib/audit";

export const dynamic = "force-dynamic";

const ACTOR: Record<string, string> = { user: "Benutzer", token: "API", system: "System" };

const LINK: Record<string, (id: number) => string> = {
  voucher: (id) => `/belege/${id}`,
  invoice: (id) => `/rechnungen/${id}`,
};

export default async function AuditLog({ searchParams }: { searchParams: Promise<{ wer?: string }> }) {
  const { wer } = await searchParams;
  const [rows, chain] = await Promise.all([
    db.auditLog.findMany({ where: wer ? { actorType: wer } : {}, orderBy: { id: "desc" }, take: 300 }),
    verifyAuditChain(),
  ]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="h1">Änderungsprotokoll</h1>
        <div className="flex gap-2 text-sm">
          <a className="btn" href="/protokoll">Alle</a>
          <a className="btn" href="/protokoll?wer=token">Nur API</a>
          <a className="btn" href="/protokoll?wer=user">Nur Benutzer</a>
        </div>
      </div>
      <div className={`rounded-md border p-3 text-sm ${chain.ok ? "border-border" : "border-danger text-danger"}`} role={chain.ok ? undefined : "alert"}>
        {chain.ok ? `Protokoll vollständig und unverändert (${chain.count} Einträge, Hash-Kette geprüft).` : `Die Hash-Kette ist ab Eintrag ${chain.brokenAt} unterbrochen. Das Protokoll wurde außerhalb von Kontor verändert.`}
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Zeit</th><th>Wer</th><th>Aktion</th><th>Objekt</th><th>Details</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="text-muted">Noch keine Einträge.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap tabular-nums">{r.createdAt.toLocaleString("de-DE")}</td>
                <td>{r.actorName} <span className="text-xs text-muted">({ACTOR[r.actorType] ?? r.actorType})</span></td>
                <td><code className="text-xs">{r.action}</code></td>
                <td>{r.entityId && LINK[r.entity] ? <a className="text-accent hover:underline" href={LINK[r.entity](r.entityId)}>{r.entity} {r.entityId}</a> : r.entityId ? `${r.entity} ${r.entityId}` : ""}</td>
                <td className="max-w-md truncate text-xs text-muted" title={r.detail}>{r.detail === "{}" ? "" : r.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
