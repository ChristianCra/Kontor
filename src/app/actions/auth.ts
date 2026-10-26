"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { NewUser } from "@/lib/users";
import { MIN_PASSWORD, endSession, hashPassword, requireUser, startSession, verifyPassword } from "@/lib/auth";

export async function logout() {
  await endSession();
  redirect("/login");
}

export async function addUser(formData: FormData) {
  await requireUser();
  const r = NewUser.safeParse(Object.fromEntries(formData.entries()));
  if (!r.success) redirect(`/einstellungen/benutzer?fehler=${encodeURIComponent(r.error.issues[0].message)}`);
  const { name, email, password } = r.data!;
  if (await db.user.findUnique({ where: { email } })) redirect(`/einstellungen/benutzer?fehler=${encodeURIComponent("Diese E-Mail-Adresse ist bereits vergeben.")}`);
  await db.user.create({ data: { name, email, passwordHash: await hashPassword(password) } });
  revalidatePath("/einstellungen/benutzer");
  redirect("/einstellungen/benutzer?ok=angelegt");
}

export async function deleteUser(id: number) {
  const me = await requireUser();
  if (me.id === id) redirect(`/einstellungen/benutzer?fehler=${encodeURIComponent("Das eigene Konto kann nicht gelöscht werden.")}`);
  await db.user.delete({ where: { id } });
  revalidatePath("/einstellungen/benutzer");
  redirect("/einstellungen/benutzer?ok=geloescht");
}

export async function changePassword(formData: FormData) {
  const me = await requireUser();
  const current = String(formData.get("current") ?? "");
  const password = String(formData.get("password") ?? "");
  const fail = (m: string) => redirect(`/einstellungen/benutzer?fehler=${encodeURIComponent(m)}`);
  if (!(await verifyPassword(current, me.passwordHash))) fail("Das aktuelle Passwort ist falsch.");
  if (password.length < MIN_PASSWORD) fail(`Das Passwort braucht mindestens ${MIN_PASSWORD} Zeichen.`);
  if (password !== formData.get("password2")) fail("Die Passwörter stimmen nicht überein.");
  // Neue Sitzungsversion meldet alle anderen Sitzungen ab
  const user = await db.user.update({ where: { id: me.id }, data: { passwordHash: await hashPassword(password), sessionVersion: { increment: 1 } } });
  await startSession(user);
  redirect("/einstellungen/benutzer?ok=passwort");
}
