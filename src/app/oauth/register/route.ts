import { NextResponse, type NextRequest } from "next/server";
import { OAuthError, registerClient } from "@/lib/oauth";

// Dynamische Client-Registrierung (RFC 7591)
export async function POST(req: NextRequest) {
  try {
    return NextResponse.json(await registerClient(await req.json()), { status: 201 });
  } catch (e) {
    const err = e instanceof OAuthError ? e : new OAuthError("invalid_client_metadata", "Ungültige Registrierung.");
    return NextResponse.json({ error: err.code, error_description: err.message }, { status: 400 });
  }
}
