import { NextResponse, type NextRequest } from "next/server";
import { publicOrigin } from "@/lib/http";
import { SCOPES_SUPPORTED } from "@/lib/oauth";

// Metadaten des Autorisierungsservers (RFC 8414)
export async function GET(req: NextRequest) {
  const origin = publicOrigin(req);
  return NextResponse.json({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: SCOPES_SUPPORTED,
  });
}
