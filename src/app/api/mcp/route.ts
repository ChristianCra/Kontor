import { NextResponse, type NextRequest } from "next/server";
import { actorFromBearer } from "@/lib/api-tokens";
import { publicOrigin } from "@/lib/http";
import { handleRpc } from "@/lib/mcp";

// Ohne gültigen Schlüssel verweist die Antwort auf die OAuth-Metadaten, damit Claude die Anmeldung startet
function unauthorized(req: NextRequest) {
  const meta = `${publicOrigin(req)}/.well-known/oauth-protected-resource/api/mcp`;
  return NextResponse.json(
    { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Anmeldung erforderlich." } },
    { status: 401, headers: { "WWW-Authenticate": `Bearer resource_metadata="${meta}"` } },
  );
}

export async function POST(req: NextRequest) {
  const actor = await actorFromBearer(req.headers.get("authorization"));
  if (!actor) return unauthorized(req);
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Ungültiges JSON." } }, { status: 400 });
  }
  const result = await handleRpc(actor, payload);
  if (result === null) return new NextResponse(null, { status: 202 });
  return NextResponse.json(result);
}

// Kein Server-Sent-Events-Kanal: der Server sendet nichts von sich aus
export async function GET() {
  return new NextResponse("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}

export const DELETE = GET;
