import type { Prisma } from "@prisma/client";

const DEFAULT_FORMATS: Record<string, string> = {
  CUSTOMER: "{NNNN}",
  INVOICE: "RE-{YYYY}-{NNNN}",
  ORDER: "AN-{YYYY}-{NNNN}",
  CREDIT_NOTE: "GU-{YYYY}-{NNNN}",
};

export function formatNumber(format: string, n: number, date = new Date()): string {
  return format
    .replace("{YYYY}", String(date.getFullYear()))
    .replace(/\{(N+)\}/, (_, ns: string) => String(n).padStart(ns.length, "0"));
}

// Muss innerhalb einer Transaktion laufen, damit keine Nummer doppelt vergeben wird.
export async function nextNumber(tx: Prisma.TransactionClient, type: string, date = new Date()): Promise<string> {
  const seq = await tx.numberSequence.upsert({
    where: { type },
    create: { type, format: DEFAULT_FORMATS[type] ?? "{NNNN}", next: 2 },
    update: { next: { increment: 1 } },
  });
  return formatNumber(seq.format, seq.next - 1, date);
}
