// Vorschläge, welche offene Rechnung oder welcher Beleg zu einem Bankumsatz passt

// invoice: Rechnung (Eingang), credit: Gutschrift (Ausgang), voucher: Ausgabebeleg, income: Einnahmebeleg
export type OpenItem = {
  kind: "invoice" | "credit" | "voucher" | "income";
  id: number;
  number: string;
  name: string;
  open: number; // offener Betrag in Cent, positiv
  date: Date;
};

export type Suggestion = OpenItem & { score: number; reasons: string[] };

const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9äöüß]+/)
    .filter((w) => w.length > 2 && !["gmbh", "und", "der", "die", "das", "kg", "ag", "ohg", "mbh", "co"].includes(w));

export function suggestMatches(tx: { amount: number; payeeName: string; purpose: string }, items: OpenItem[], limit = 3): Suggestion[] {
  const incoming = tx.amount > 0;
  const amount = Math.abs(tx.amount);
  const purpose = tx.purpose.toLowerCase().replace(/\s/g, "");
  const payee = new Set(words(tx.payeeName));
  return items
    .filter((i) => (incoming ? i.kind === "invoice" || i.kind === "income" : i.kind === "voucher" || i.kind === "credit"))
    .map((i) => {
      let score = 0;
      const reasons: string[] = [];
      if (i.open === amount) {
        score += 50;
        reasons.push("Betrag stimmt");
      } else if (amount < i.open) {
        score += 10;
        reasons.push("Teilzahlung möglich");
      }
      if (i.number && purpose.includes(i.number.toLowerCase().replace(/\s/g, ""))) {
        score += 40;
        reasons.push("Nummer im Verwendungszweck");
      }
      const nameHits = words(i.name).filter((w) => payee.has(w) || purpose.includes(w)).length;
      if (nameHits) {
        score += Math.min(20, nameHits * 10);
        reasons.push("Name passt");
      }
      return { ...i, score, reasons };
    })
    .filter((s) => s.score >= 40)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
