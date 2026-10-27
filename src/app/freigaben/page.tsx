import { db } from "@/lib/db";
import { decide } from "@/app/actions/api";
import { formatDate } from "@/lib/money";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { pending: "offen", approved: "freigegeben", rejected: "abgelehnt", failed: "fehlgeschlagen" };

export default async function Approvals({ searchParams }: { searchParams: Promise<{ fehler?: string }> }) {
  const { fehler } = await searchParams;
  const [pending, done] = await Promise.all([
    db.approval.findMany({ where: { status: "pending" }, orderBy: { createdAt: "asc" } }),
    db.approval.findMany({ where: { status: { not: "pending" } }, orderBy: { decidedAt: "desc" }, take: 30 }),
  ]);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="h1">Freigaben</h1>
        <p className="text-sm text-muted">Schritte, die Claude oder ein anderer API-Zugang vorgeschlagen hat. Erst nach deiner Freigabe führt Kontor sie aus.</p>
      </div>
      {fehler && <div className="rounded-md border border-danger p-3 text-sm text-danger" role="alert">{fehler}</div>}
      <div className="space-y-2">
        {pending.length === 0 && <div className="card text-sm text-muted">Nichts offen.</div>}
        {pending.map((a) => (
          <div key={a.id} className="card flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium">{a.summary}</div>
              {a.reason && <div className="text-sm">Begründung: {a.reason}</div>}
              <div className="text-xs text-muted">von {a.requestedBy} am {formatDate(a.createdAt)}</div>
            </div>
            <div className="flex gap-2">
              <form action={decide.bind(null, a.id, true)}><button className="btn-primary">Freigeben</button></form>
              <form action={decide.bind(null, a.id, false)}><button className="btn">Ablehnen</button></form>
            </div>
          </div>
        ))}
      </div>
      {done.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead><tr><th>Vorschlag</th><th>Von</th><th>Stand</th><th>Entschieden</th></tr></thead>
            <tbody>
              {done.map((a) => (
                <tr key={a.id}>
                  <td>{a.summary}{a.error && <div className="text-xs text-danger">{a.error}</div>}</td>
                  <td>{a.requestedBy}</td>
                  <td>{STATUS[a.status] ?? a.status}</td>
                  <td>{a.decidedBy} · {formatDate(a.decidedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
