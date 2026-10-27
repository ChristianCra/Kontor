"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isScope } from "@/lib/api-tokens";
import { createCode, loadClient } from "@/lib/oauth";

// Zustimmung bzw. Ablehnung auf der Seite /oauth/authorize
export async function authorizeClient(formData: FormData) {
  const user = await requireUser();
  const clientId = String(formData.get("client_id") ?? "");
  const redirectUri = String(formData.get("redirect_uri") ?? "");
  const state = String(formData.get("state") ?? "");
  const client = await loadClient(clientId, redirectUri);
  const target = new URL(redirectUri);
  if (state) target.searchParams.set("state", state);
  if (formData.get("decision") !== "allow") {
    target.searchParams.set("error", "access_denied");
    redirect(target.toString());
  }
  const scopes = ["read", ...formData.getAll("scope").map(String).filter((s) => isScope(s) && s !== "read")];
  const code = await createCode({ clientId: client.id, redirectUri, codeChallenge: String(formData.get("code_challenge") ?? ""), scopes, userId: user.id });
  target.searchParams.set("code", code);
  redirect(target.toString());
}
