import { orderFiles } from "@/lib/documents";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const files = await orderFiles(Number((await params).id));
  if (!files) return new Response("Nicht gefunden", { status: 404 });
  return new Response(files.pdf, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${files.filename}"` },
  });
}
