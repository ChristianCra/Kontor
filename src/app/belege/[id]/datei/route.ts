import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { STORAGE_DIR } from "@/lib/vouchers";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const v = await db.voucher.findUnique({ where: { id: Number((await params).id) } });
  if (!v?.filePath) return new Response("Nicht gefunden", { status: 404 });
  // Nur Dateien aus dem Speicherordner ausliefern
  const resolved = path.resolve(v.filePath);
  if (!resolved.startsWith(path.resolve(STORAGE_DIR) + path.sep)) return new Response("Nicht erlaubt", { status: 403 });
  const data = await readFile(resolved);
  return new Response(data, {
    headers: { "Content-Type": v.fileType ?? "application/octet-stream", "Content-Disposition": `inline; filename="${encodeURIComponent(v.fileName ?? "beleg")}"` },
  });
}
