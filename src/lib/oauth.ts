// Minimaler OAuth-2.1-Server für MCP-Connectors: dynamische Client-Registrierung, Autorisierungscode mit PKCE (S256).
// Das ausgegebene Zugriffstoken ist ein gewöhnlicher API-Schlüssel und lässt sich unter Einstellungen → API widerrufen.
import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";
import { audit } from "./audit";
import { createApiToken, hashToken, parseScopes, SCOPES } from "./api-tokens";

export const SCOPES_SUPPORTED = Object.keys(SCOPES);

export class OAuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

// https für alles außer lokale Entwicklungsadressen
export function validRedirectUri(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.hash) return false;
    return u.protocol === "https:" || (u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname));
  } catch {
    return false;
  }
}

export async function registerClient(input: { client_name?: unknown; redirect_uris?: unknown }) {
  const uris = Array.isArray(input.redirect_uris) ? input.redirect_uris.map(String) : [];
  if (!uris.length || !uris.every(validRedirectUri)) throw new OAuthError("invalid_redirect_uri", "redirect_uris müssen https-Adressen sein.");
  const name = String(input.client_name ?? "").slice(0, 100);
  const client = await db.oAuthClient.create({ data: { id: randomBytes(16).toString("hex"), name, redirectUris: JSON.stringify(uris) } });
  return { client_id: client.id, client_name: name, redirect_uris: uris, grant_types: ["authorization_code"], response_types: ["code"], token_endpoint_auth_method: "none" };
}

export async function loadClient(clientId: string, redirectUri: string) {
  const client = await db.oAuthClient.findUnique({ where: { id: clientId } });
  if (!client) throw new OAuthError("invalid_client", "Unbekannter Client.");
  if (!(JSON.parse(client.redirectUris) as string[]).includes(redirectUri)) throw new OAuthError("invalid_request", "Die Weiterleitungsadresse ist für diesen Client nicht registriert.");
  return client;
}

export async function createCode(p: { clientId: string; redirectUri: string; codeChallenge: string; scopes: string[]; userId: number }) {
  const code = randomBytes(32).toString("base64url");
  await db.oAuthCode.create({
    data: { codeHash: hashToken(code), clientId: p.clientId, redirectUri: p.redirectUri, codeChallenge: p.codeChallenge, scopes: p.scopes.join(","), userId: p.userId, expiresAt: new Date(Date.now() + 10 * 60000) },
  });
  return code;
}

export const pkceChallenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

export async function exchangeCode(p: { code: string; clientId: string; redirectUri: string; codeVerifier: string }) {
  const row = await db.oAuthCode.findUnique({ where: { codeHash: hashToken(p.code) } });
  if (!row || row.usedAt || row.expiresAt < new Date() || row.clientId !== p.clientId || row.redirectUri !== p.redirectUri) {
    throw new OAuthError("invalid_grant", "Der Code ist ungültig oder abgelaufen.");
  }
  if (!p.codeVerifier || pkceChallenge(p.codeVerifier) !== row.codeChallenge) throw new OAuthError("invalid_grant", "PKCE-Prüfung fehlgeschlagen.");
  // Codes sind einmalig; updateMany mit usedAt: null verhindert doppelte Einlösung
  const claimed = await db.oAuthCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (!claimed.count) throw new OAuthError("invalid_grant", "Der Code wurde bereits verwendet.");
  const client = await db.oAuthClient.findUniqueOrThrow({ where: { id: row.clientId } });
  const user = await db.user.findUnique({ where: { id: row.userId } });
  const scopes = parseScopes(row.scopes);
  const { token, row: t } = await createApiToken(client.name || "Connector", scopes, row.userId, client.id);
  await audit({ type: "user", name: user?.email ?? `Benutzer ${row.userId}`, userId: row.userId }, "token.create", "apiToken", t.id, { name: t.name, scopes, via: "oauth" });
  return { access_token: token, token_type: "Bearer", scope: t.scopes.split(",").join(" ") };
}
