import { db } from "@/lib/db";

export async function MailHistory({ docType, docId }: { docType: "invoice" | "order"; docId: number }) {
  const logs = await db.mailLog.findMany({ where: { docType, docId }, orderBy: { createdAt: "desc" } });
  if (!logs.length) return null;
  return (
    <div className="card overflow-x-auto p-0">
      <div className="px-5 pt-4 text-sm font-medium">E-Mail-Versand</div>
      <table className="table">
        <thead><tr><th>Zeitpunkt</th><th>An</th><th>Betreff</th><th>Von</th></tr></thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id}>
              <td>{l.createdAt.toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}{l.testMode && <span className="text-xs text-muted"> (Testmodus)</span>}</td>
              <td>{l.to}{l.cc && <div className="text-xs text-muted">Kopie: {l.cc}</div>}</td>
              <td>{l.subject}</td>
              <td className="text-xs">{l.sentBy}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SentNotice({ value }: { value?: string }) {
  if (!value) return null;
  return (
    <div className="rounded-md border border-border p-3 text-sm" role="status">
      {value === "test" ? "E-Mail im Testmodus erzeugt und in storage/outbox abgelegt." : "E-Mail wurde versendet."}
    </div>
  );
}
