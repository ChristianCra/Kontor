import { db } from "@/lib/db";
import { buildDatevCsv, validatePeriod } from "@/lib/datev";
import { loadDatevInput } from "@/lib/datev-data";

export async function POST(req: Request) {
  const form = await req.formData();
  const from = new Date(String(form.get("from")));
  const toInclusive = new Date(String(form.get("to")));
  const to = new Date(toInclusive.getFullYear(), toInclusive.getMonth(), toInclusive.getDate() + 1);
  from.setHours(0, 0, 0, 0);
  const period = { from, to };
  const enshrine = form.get("enshrine") === "on";
  const input = await loadDatevInput(period);
  const error = validatePeriod(period, input.settings.fiscalYearStart);
  if (error) return new Response(error, { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const { csv, lines } = buildDatevCsv(input.entries, input.transactions, period, input.settings, enshrine, new Date(), input.afa);
  if (enshrine) {
    // Exportierte Dokumente werden festgeschrieben (GoBD)
    const now = new Date();
    await db.invoice.updateMany({ where: { invoiceDate: { gte: from, lt: to }, status: { not: 100 }, enshrinedAt: null }, data: { enshrinedAt: now } });
    await db.voucher.updateMany({ where: { voucherDate: { gte: from, lt: to }, status: { not: 50 }, enshrinedAt: null }, data: { enshrinedAt: now } });
  }
  await db.datevExport.create({ data: { from, to, lines, enshrined: enshrine } });
  const name = `EXTF_Buchungsstapel_${from.toISOString().slice(0, 10)}_${toInclusive.toISOString().slice(0, 10)}.csv`;
  // DATEV erwartet Windows-1252; alle verwendeten Zeichen sind in Latin-1 enthalten
  return new Response(Buffer.from(csv, "latin1"), {
    headers: { "Content-Type": "text/csv; charset=windows-1252", "Content-Disposition": `attachment; filename="${name}"` },
  });
}
