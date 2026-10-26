import { INVOICE_STATUS } from "@/lib/invoices";

const STYLES: Record<number, string> = {
  100: "bg-gray-500/15 text-muted",
  200: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  750: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  1000: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

export function StatusBadge({ status, overdue, type }: { status: number; overdue?: boolean; type?: string }) {
  if (type === "MA" && status !== 100)
    return <span className={`rounded px-2 py-0.5 text-xs font-medium ${status === 1000 ? STYLES[1000] : STYLES[200]}`}>{status === 1000 ? "Erledigt" : "Gemahnt"}</span>;
  if (type === "SR") return <span className="rounded px-2 py-0.5 text-xs font-medium bg-gray-500/15 text-muted">Storno</span>;
  if (overdue) return <span className="rounded px-2 py-0.5 text-xs font-medium bg-red-500/15 text-danger">Überfällig</span>;
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${STYLES[status] ?? ""}`}>{INVOICE_STATUS[status] ?? status}</span>;
}
