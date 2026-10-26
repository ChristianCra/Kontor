import type { Period } from "./journal";

// Abschreibung (AfA) von Anlagegütern, reine Rechenlogik ohne Datenbank

export type AssetMethod = "linear" | "digital" | "gwg" | "pool";

export const ASSET_METHODS: Record<AssetMethod, string> = {
  linear: "Linear über die Nutzungsdauer",
  digital: "Digitales Wirtschaftsgut (1 Jahr)",
  gwg: "Geringwertiges Wirtschaftsgut (sofort)",
  pool: "Sammelposten (5 Jahre)",
};

export const GWG_LIMIT = 80000; // 800 € netto
export const POOL_MIN = 25001;
export const POOL_MAX = 100000;

// Vorschlag für Methode und Nutzungsdauer nach SKR03-Konto (AfA-Tabelle für allgemein verwendbare Anlagegüter)
export function defaultsForAccount(skr03: string): { method: AssetMethod; years: number } {
  switch (skr03) {
    case "0480": return { method: "gwg", years: 1 };
    case "0485": return { method: "pool", years: 5 };
    case "0490":
    case "0027": return { method: "digital", years: 1 };
    case "0320": return { method: "linear", years: 6 };
    case "0420": return { method: "linear", years: 13 };
    default: return { method: "linear", years: 5 };
  }
}

export type AssetLike = {
  id: number;
  name: string;
  method: string;
  acquisitionDate: Date;
  cost: number;
  usefulLifeYears: number;
  disposalDate: Date | null;
  disposalProceeds: number;
};

// Zeile der Anlage EÜR, auf der der Betrag landet
export type AfaKind = "afa" | "gwg" | "pool" | "residual" | "proceeds";

export type AfaItem = { assetId: number; date: Date; amount: number; kind: AfaKind };

const monthEnd = (y: number, m: number) => new Date(y, m + 1, 0);
const monthIndex = (d: Date) => d.getFullYear() * 12 + d.getMonth();

// Alle Abschreibungsbeträge eines Anlageguts, je Monat (linear, monatsgenau nach §7 Abs. 1 Satz 4 EStG)
// bzw. je Jahr (Sammelposten). Rundungsdifferenzen werden über die kumulierte Rundung ausgeglichen.
export function afaSchedule(a: AssetLike): AfaItem[] {
  const items: AfaItem[] = [];
  const y = a.acquisitionDate.getFullYear();
  const m = a.acquisitionDate.getMonth();
  const push = (date: Date, amount: number, kind: AfaKind) => amount && items.push({ assetId: a.id, date, amount, kind });

  if (a.method === "pool") {
    // Sammelposten: je 1/5 im Jahr der Bildung und den vier Folgejahren, ein Abgang ändert daran nichts
    let done = 0;
    for (let k = 1; k <= 5; k++) {
      const cum = Math.round((a.cost * k) / 5);
      push(new Date(y + k - 1, 11, 31), cum - done, "pool");
      done = cum;
    }
    return items;
  }

  const disposal = a.disposalDate ? monthIndex(a.disposalDate) : Infinity;
  let done = 0;
  if (a.method === "gwg" || a.method === "digital") {
    if (disposal >= monthIndex(a.acquisitionDate)) {
      push(monthEnd(y, m), a.cost, a.method === "gwg" ? "gwg" : "afa");
      done = a.cost;
    }
  } else {
    const months = Math.max(1, a.usefulLifeYears) * 12;
    for (let k = 1; k <= months; k++) {
      const idx = monthIndex(a.acquisitionDate) + k - 1;
      if (idx > disposal) break;
      const cum = Math.round((a.cost * k) / months);
      push(monthEnd(Math.floor(idx / 12), idx % 12), cum - done, "afa");
      done = cum;
    }
  }
  if (a.disposalDate) {
    // Restbuchwert als Betriebsausgabe, Erlös als Betriebseinnahme
    push(a.disposalDate, a.cost - done, "residual");
    push(a.disposalDate, a.disposalProceeds, "proceeds");
  }
  return items;
}

export function afaInPeriod(a: AssetLike, p: Period): AfaItem[] {
  return afaSchedule(a).filter((i) => i.date >= p.from && i.date < p.to);
}

// Buchwert am Ende des Tages vor `date`
export function bookValue(a: AssetLike, date: Date): number {
  if (a.acquisitionDate >= date) return 0;
  const used = afaSchedule(a).filter((i) => i.date < date && i.kind !== "proceeds").reduce((s, i) => s + i.amount, 0);
  return a.cost - used;
}

export function methodWarning(a: { method: string; cost: number }): string | null {
  if (a.method === "gwg" && a.cost > GWG_LIMIT) return "Über 800 € netto ist keine Sofortabschreibung als GWG möglich.";
  if (a.method === "pool" && (a.cost < POOL_MIN || a.cost > POOL_MAX)) return "Der Sammelposten gilt nur für Wirtschaftsgüter von 250,01 € bis 1.000 € netto.";
  return null;
}
