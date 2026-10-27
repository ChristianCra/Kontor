"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { userActor } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { createApiToken, isScope } from "@/lib/api-tokens";
import { decideApproval } from "@/lib/ops";

export type TokenResult = { error?: string; token?: string };

export async function createToken(_prev: TokenResult, formData: FormData): Promise<TokenResult> {
  const actor = await userActor();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Bitte einen Namen angeben." };
  const scopes = formData.getAll("scope").map(String).filter(isScope);
  const { token, row } = await createApiToken(name, scopes, actor.userId ?? null);
  await audit(actor, "token.create", "apiToken", row.id, { name, scopes: row.scopes });
  revalidatePath("/einstellungen/api");
  return { token };
}

export async function revokeToken(id: number) {
  const actor = await userActor();
  const t = await db.apiToken.update({ where: { id }, data: { revokedAt: new Date() } });
  await audit(actor, "token.revoke", "apiToken", id, { name: t.name });
  revalidatePath("/einstellungen/api");
}

export async function decide(id: number, approve: boolean) {
  const actor = await userActor();
  let error = "";
  try {
    await decideApproval(actor, id, approve);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  revalidatePath("/freigaben");
  revalidatePath("/", "layout");
  redirect(error ? `/freigaben?fehler=${encodeURIComponent(error)}` : "/freigaben");
}
