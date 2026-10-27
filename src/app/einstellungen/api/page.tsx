import { headers } from "next/headers";
import { db } from "@/lib/db";
import { SCOPES } from "@/lib/api-tokens";
import { originFromHeaders } from "@/lib/http";
import { formatDate } from "@/lib/money";
import { revokeToken } from "@/app/actions/api";
import { TokenForm } from "@/components/TokenForm";
import { CopyValue } from "@/components/CopyValue";

export const dynamic = "force-dynamic";

const SCOPE_SHORT: Record<string, string> = { read: "Lesen", draft: "Entwürfe", book: "Buchen" };

export default async function ApiSettings() {
  const origin = originFromHeaders(await headers());
  const tokens = await db.apiToken.findMany({ orderBy: { createdAt: "desc" } });
  return (
    <div className="space-y-4">
      <h1 className="h1">API und Claude</h1>
      <div className="card max-w-3xl space-y-3 text-sm">
        <p>
          Über den MCP-Server arbeitet Claude direkt mit Kontor: Belege anlegen, Bankumsätze zuordnen, offene Posten und Berichte abfragen.
          Buchungen ohne das Recht „Buchen“ landen zuerst unter <a className="text-accent hover:underline" href="/freigaben">Freigaben</a>. Jede Änderung steht im <a className="text-accent hover:underline" href="/protokoll">Protokoll</a>.
        </p>
        <div>
          <div className="label">MCP-Server (als Connector in Claude eintragen, Anmeldung per OAuth)</div>
          <code>{origin}/api/mcp</code> <CopyValue value={`${origin}/api/mcp`} />
        </div>
        <div>
          <div className="label">REST-API (Header „Authorization: Bearer &lt;Schlüssel&gt;“)</div>
          <code>{origin}/api/v1</code> <CopyValue value={`${origin}/api/v1`} />
        </div>
      </div>
      <div className="grid max-w-5xl gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead><tr><th>Name</th><th>Schlüssel</th><th>Rechte</th><th>Zuletzt genutzt</th><th /></tr></thead>
            <tbody>
              {tokens.length === 0 && <tr><td colSpan={5} className="text-muted">Noch keine Schlüssel.</td></tr>}
              {tokens.map((t) => (
                <tr key={t.id} className={t.revokedAt ? "text-muted line-through" : ""}>
                  <td>{t.name}{t.clientId && <span className="text-xs text-muted"> (Connector)</span>}</td>
                  <td><code className="text-xs">{t.prefix}…</code></td>
                  <td>{t.scopes.split(",").map((s) => SCOPE_SHORT[s] ?? s).join(", ")}</td>
                  <td>{t.lastUsedAt ? formatDate(t.lastUsedAt) : "nie"}</td>
                  <td className="text-right">
                    {!t.revokedAt && <form action={revokeToken.bind(null, t.id)}><button className="btn text-danger">Widerrufen</button></form>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TokenForm scopes={SCOPES} />
      </div>
    </div>
  );
}
