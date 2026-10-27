import { requireUser } from "@/lib/auth";
import { SCOPES, parseScopes } from "@/lib/api-tokens";
import { loadClient, OAuthError } from "@/lib/oauth";
import { authorizeClient } from "@/app/actions/oauth";

export const dynamic = "force-dynamic";

type Params = Record<string, string | undefined>;

export default async function Authorize({ searchParams }: { searchParams: Promise<Params> }) {
  await requireUser();
  const p = await searchParams;
  let error = "";
  let clientName = "";
  if (p.response_type !== "code") error = "Nur response_type=code wird unterstützt.";
  else if (!p.code_challenge || p.code_challenge_method !== "S256") error = "PKCE mit S256 ist Pflicht.";
  else {
    try {
      clientName = (await loadClient(p.client_id ?? "", p.redirect_uri ?? "")).name || "Unbenannter Client";
    } catch (e) {
      error = e instanceof OAuthError ? e.message : "Ungültige Anfrage.";
    }
  }
  if (error) {
    return (
      <div className="card mx-auto mt-10 max-w-md space-y-2">
        <h1 className="h1">Verbindung nicht möglich</h1>
        <p className="text-sm text-danger" role="alert">{error}</p>
      </div>
    );
  }
  // Ohne Angabe schlagen wir Lesen und Entwürfe vor; Buchen ohne Freigabe muss man bewusst ankreuzen
  const requested = p.scope ? parseScopes(p.scope) : ["read", "draft"];
  return (
    <form action={authorizeClient} className="card mx-auto mt-10 max-w-md space-y-4">
      <h1 className="h1">{clientName} mit Kontor verbinden?</h1>
      <p className="text-sm text-muted">Der Zugang erscheint danach unter Einstellungen → API und lässt sich dort jederzeit widerrufen. Alle Änderungen landen im Protokoll.</p>
      {(["client_id", "redirect_uri", "state", "code_challenge"] as const).map((k) => <input key={k} type="hidden" name={k} value={p[k] ?? ""} />)}
      <fieldset className="space-y-2">
        {(Object.keys(SCOPES) as (keyof typeof SCOPES)[]).map((s) => (
          <label key={s} className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="scope" value={s} defaultChecked={s === "read" || requested.includes(s)} disabled={s === "read"} className="mt-1" />
            <span>{SCOPES[s]}</span>
          </label>
        ))}
      </fieldset>
      <div className="flex gap-2">
        <button className="btn-primary" name="decision" value="allow">Verbinden</button>
        <button className="btn" name="decision" value="deny">Ablehnen</button>
      </div>
    </form>
  );
}
