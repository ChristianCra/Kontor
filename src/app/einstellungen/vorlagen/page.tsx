import { getTemplate, MAIL_DOC_LABEL, MAIL_PLACEHOLDERS, mailTestMode, type MailDocType } from "@/lib/mail";
import { saveMailTemplate } from "@/app/actions/mail";

export const dynamic = "force-dynamic";

export default async function MailTemplates({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const { ok } = await searchParams;
  const types = Object.keys(MAIL_DOC_LABEL) as MailDocType[];
  const templates = await Promise.all(types.map(getTemplate));
  return (
    <div className="space-y-4">
      <h1 className="h1">E-Mail-Vorlagen</h1>
      <p className="text-sm text-muted">Platzhalter: {MAIL_PLACEHOLDERS.join(", ")}. {mailTestMode() ? "Versand im Testmodus (kein SMTP_URL gesetzt)." : "Versand über den eingerichteten SMTP-Server."}</p>
      {ok && <div className="rounded-md border border-border p-3 text-sm">Vorlage gespeichert.</div>}
      {templates.map((t, i) => (
        <form key={types[i]} action={saveMailTemplate.bind(null, types[i])} className="card max-w-3xl space-y-3">
          <h2 className="font-medium">{MAIL_DOC_LABEL[types[i]]}</h2>
          <div><label className="label">Betreff</label><input className="input" name="subject" required defaultValue={t.subject} /></div>
          <div><label className="label">Nachricht</label><textarea className="input font-mono text-sm" name="body" rows={8} required defaultValue={t.body} /></div>
          <button className="btn-primary">Speichern</button>
        </form>
      ))}
    </div>
  );
}
