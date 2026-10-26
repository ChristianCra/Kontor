import Link from "next/link";

export function SendMailForm({ action, to, subject, body, attachment, xml, back, testMode }: {
  action: (fd: FormData) => Promise<void>; to: string; subject: string; body: string; attachment: string; xml: boolean; back: string; testMode: boolean;
}) {
  return (
    <form action={action} className="card max-w-3xl space-y-3">
      {testMode && <div className="rounded-md border border-amber-500 p-3 text-sm">Testmodus: Es ist kein SMTP-Server eingerichtet (SMTP_URL). Die E-Mail wird nur als Datei im Ordner storage/outbox abgelegt.</div>}
      <div><label className="label" htmlFor="to">An *</label><input className="input" id="to" name="to" required defaultValue={to} placeholder="kunde@example.com" /></div>
      <div><label className="label" htmlFor="cc">Kopie an</label><input className="input" id="cc" name="cc" placeholder="mehrere Adressen mit Komma trennen" /></div>
      <div><label className="label" htmlFor="subject">Betreff *</label><input className="input" id="subject" name="subject" required defaultValue={subject} /></div>
      <div><label className="label" htmlFor="body">Nachricht *</label><textarea className="input font-mono text-sm" id="body" name="body" rows={10} required defaultValue={body} /></div>
      <div className="text-sm">Anhang: 📎 {attachment}</div>
      {xml && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="xml" defaultChecked /> XRechnung zusätzlich als XML-Datei anhängen</label>}
      <div className="flex gap-2"><button className="btn-primary">Senden</button><Link className="btn" href={back}>Abbrechen</Link></div>
    </form>
  );
}
