import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode, OAuthError } from "@/lib/oauth";

export async function POST(req: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const form = new URLSearchParams(await req.text());
    if (form.get("grant_type") !== "authorization_code") throw new OAuthError("unsupported_grant_type", "Nur authorization_code wird unterstützt.");
    const token = await exchangeCode({
      code: form.get("code") ?? "",
      clientId: form.get("client_id") ?? "",
      redirectUri: form.get("redirect_uri") ?? "",
      codeVerifier: form.get("code_verifier") ?? "",
    });
    return NextResponse.json(token, { headers });
  } catch (e) {
    const err = e instanceof OAuthError ? e : new OAuthError("server_error", "Interner Fehler.", 500);
    if (!(e instanceof OAuthError)) console.error(e);
    return NextResponse.json({ error: err.code, error_description: err.message }, { status: err.status, headers });
  }
}
