// Signiertes Sitzungs-Cookie (HMAC-SHA256). Nutzt nur Web Crypto, damit es auch in der Middleware läuft.

export const SESSION_COOKIE = "kontor_session";
export const SESSION_DAYS = 14;

export type SessionPayload = { u: number; v: number; e: number }; // Benutzer, Sitzungsversion, Ablauf (ms)

function secret(): string | null {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  // Ohne AUTH_SECRET sind Anmeldungen nur in der Entwicklung möglich
  return process.env.NODE_ENV === "production" ? null : "kontor-entwicklung-nicht-produktiv";
}

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function key(s: string) {
  return crypto.subtle.importKey("raw", enc.encode(s), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signSession(p: SessionPayload): Promise<string> {
  const s = secret();
  if (!s) throw new Error("AUTH_SECRET ist nicht gesetzt.");
  const body = b64url(enc.encode(JSON.stringify(p)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await key(s), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  const s = secret();
  if (!s || !token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await key(s), fromB64url(sig), enc.encode(body));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(fromB64url(body))) as SessionPayload;
    return typeof p.u === "number" && typeof p.v === "number" && p.e > Date.now() ? p : null;
  } catch {
    return null;
  }
}
