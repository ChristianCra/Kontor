import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser, MIN_PASSWORD } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: Promise<{ fehler?: string; weiter?: string }> }) {
  const { fehler, weiter } = await searchParams;
  if (await getCurrentUser()) redirect("/");
  const setup = (await db.user.count()) === 0;
  return (
    <div className="mx-auto mt-12 max-w-sm space-y-4">
      <div>
        <h1 className="h1">{setup ? "Kontor einrichten" : "Anmelden"}</h1>
        {setup && <p className="text-sm text-muted">Lege das erste Benutzerkonto an. Weitere Benutzer kannst du danach in den Einstellungen hinzufügen.</p>}
      </div>
      {fehler && <div className="rounded-md border border-danger p-3 text-sm text-danger" role="alert">{fehler}</div>}
      <form method="post" action={setup ? "/auth/setup" : "/auth/login"} className="card space-y-3">
        <input type="hidden" name="weiter" value={weiter ?? "/"} />
        {setup && <div><label className="label" htmlFor="name">Name</label><input className="input" id="name" name="name" required autoComplete="name" /></div>}
        <div><label className="label" htmlFor="email">E-Mail</label><input className="input" id="email" name="email" type="email" required autoComplete="username" /></div>
        <div><label className="label" htmlFor="password">Passwort</label><input className="input" id="password" name="password" type="password" required minLength={setup ? MIN_PASSWORD : undefined} autoComplete={setup ? "new-password" : "current-password"} /></div>
        {setup && <div><label className="label" htmlFor="password2">Passwort wiederholen</label><input className="input" id="password2" name="password2" type="password" required autoComplete="new-password" /></div>}
        <button className="btn-primary w-full">{setup ? "Konto anlegen" : "Anmelden"}</button>
      </form>
    </div>
  );
}
