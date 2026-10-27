import { NextResponse, type NextRequest } from "next/server";
import { publicOrigin } from "@/lib/http";
import { SCOPES_SUPPORTED } from "@/lib/oauth";

// Metadaten der geschützten Ressource (RFC 9728), auch unter /.well-known/oauth-protected-resource/api/mcp
export async function GET(req: NextRequest) {
  const origin = publicOrigin(req);
  return NextResponse.json({
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    scopes_supported: SCOPES_SUPPORTED,
    bearer_methods_supported: ["header"],
    resource_name: "Kontor",
  });
}
