import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { OpError } from "./ops";

// Öffentliche Adresse von Kontor, auch hinter einem Reverse-Proxy wie Caddy
export function publicOrigin(req: Request): string {
  return originFromHeaders(req.headers, new URL(req.url));
}

export function originFromHeaders(h: Headers, fallback?: URL): string {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, "");
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? fallback?.host ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? fallback?.protocol.replace(":", "") ?? "http";
  return `${proto}://${host}`;
}

export function errorInfo(e: unknown): { status: number; message: string } {
  if (e instanceof OpError) return { status: e.status, message: e.message };
  if (e instanceof ZodError) return { status: 422, message: e.issues.map((i) => `${i.path.join(".") || "Eingabe"}: ${i.message}`).join("; ") };
  if (e instanceof SyntaxError) return { status: 400, message: "Ungültiges JSON." };
  console.error(e);
  return { status: 500, message: "Interner Fehler." };
}

export function errorResponse(e: unknown) {
  const { status, message } = errorInfo(e);
  return NextResponse.json({ error: message }, { status });
}
