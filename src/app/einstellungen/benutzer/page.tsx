import { db } from "@/lib/db";
import { MIN_PASSWORD, requireUser } from "@/lib/auth";
import { addUser, changePassword, deleteUser } from "@/app/actions/auth";
import { formatDate } from "@/lib/money";

export const dynamic = "force-dynamic";

const OK: Record<string, string> = { angelegt: "Benutzer angelegt.", geloescht: "Benutzer gelöscht.", passwort: "Passwort geändert. Andere Sitzungen wurden abgemeldet." };

export default async function Users({ searchParams }: { searchParams: Promise<{ fehler?: string; ok?: string }> }) {
  const { fehler, ok } = await searchParams;
  const me = await requireUser();
  const users = await db.user.findMany({ orderBy: { createdAt: "asc" } });
  return (
    <div className="space-y-4">
      <h1 className="h1">Benutzer</h1>
      {fehler && <div className="rounded-md border border-danger p-3 text-sm text-danger" role="alert">{fehler}</div>}
      {ok && OK[ok] && <div className="rounded-md border border-border p-3 text-sm">{OK[ok]}</div>}
      <div className="card max-w-3xl overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Name</th><th>E-Mail</th><th>Angelegt</th><th /></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}{u.id === me.id && <span className="text-xs text-muted"> (du)</span>}</td>
                <td>{u.email}</td>
                <td>{formatDate(u.createdAt)}</td>
                <td className="text-right">{u.id !== me.id && <form action={deleteUser.bind(null, u.id)}><button className="btn text-danger">Löschen</button></form>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid max-w-3xl gap-4 md:grid-cols-2">
        <form action={addUser} className="card space-y-3">
          <h2 className="font-medium">Benutzer hinzufügen</h2>
          <div><label className="label">Name</label><input className="input" name="name" required /></div>
          <div><label className="label">E-Mail</label><input className="input" name="email" type="email" required /></div>
          <div><label className="label">Passwort (mind. {MIN_PASSWORD} Zeichen)</label><input className="input" name="password" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" /></div>
          <div><label className="label">Passwort wiederholen</label><input className="input" name="password2" type="password" required autoComplete="new-password" /></div>
          <button className="btn-primary">Hinzufügen</button>
        </form>
        <form action={changePassword} className="card space-y-3">
          <h2 className="font-medium">Eigenes Passwort ändern</h2>
          <div><label className="label">Aktuelles Passwort</label><input className="input" name="current" type="password" required autoComplete="current-password" /></div>
          <div><label className="label">Neues Passwort</label><input className="input" name="password" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" /></div>
          <div><label className="label">Neues Passwort wiederholen</label><input className="input" name="password2" type="password" required autoComplete="new-password" /></div>
          <button className="btn-primary">Passwort ändern</button>
        </form>
      </div>
    </div>
  );
}
