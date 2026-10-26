import { describe, expect, it } from "vitest";
import { afaInPeriod, afaSchedule, bookValue, methodWarning } from "./afa";
import { periodFor } from "./journal";

const base = { id: 1, name: "Test", disposalDate: null, disposalProceeds: 0 };

describe("AfA", () => {
  it("schreibt linear monatsgenau ab dem Anschaffungsmonat ab", () => {
    // 3.600 € über 3 Jahre, Anschaffung im Oktober: 2026 drei Monate = 300 €
    const a = { ...base, method: "linear", acquisitionDate: new Date(2026, 9, 15), cost: 360000, usefulLifeYears: 3 };
    const y = (year: number) => afaInPeriod(a, periodFor("YEAR", year, 1)).reduce((s, i) => s + i.amount, 0);
    expect(y(2026)).toBe(30000);
    expect(y(2027)).toBe(120000);
    expect(y(2029)).toBe(90000);
    expect(afaSchedule(a).reduce((s, i) => s + i.amount, 0)).toBe(360000);
    expect(bookValue(a, new Date(2027, 0, 1))).toBe(330000);
  });

  it("verteilt Rundungsdifferenzen ohne Restcent", () => {
    const a = { ...base, method: "linear", acquisitionDate: new Date(2026, 0, 1), cost: 100001, usefulLifeYears: 7 };
    expect(afaSchedule(a).reduce((s, i) => s + i.amount, 0)).toBe(100001);
  });

  it("bucht GWG und digitale Wirtschaftsgüter sofort", () => {
    const gwg = { ...base, method: "gwg", acquisitionDate: new Date(2026, 4, 3), cost: 59900, usefulLifeYears: 1 };
    expect(afaSchedule(gwg)).toEqual([{ assetId: 1, date: new Date(2026, 4, 31), amount: 59900, kind: "gwg" }]);
    expect(methodWarning({ method: "gwg", cost: 90000 })).toMatch(/800/);
    const laptop = { ...gwg, method: "digital", cost: 180000 };
    expect(afaSchedule(laptop)[0]).toMatchObject({ amount: 180000, kind: "afa" });
  });

  it("löst den Sammelposten über fünf Jahre auf", () => {
    const a = { ...base, method: "pool", acquisitionDate: new Date(2026, 10, 1), cost: 90000, usefulLifeYears: 5 };
    const s = afaSchedule(a);
    expect(s.map((i) => i.amount)).toEqual([18000, 18000, 18000, 18000, 18000]);
    expect(s[0].date).toEqual(new Date(2026, 11, 31));
  });

  it("bucht beim Abgang den Restbuchwert aus", () => {
    const a = { ...base, method: "linear", acquisitionDate: new Date(2026, 0, 10), cost: 120000, usefulLifeYears: 5, disposalDate: new Date(2027, 5, 20), disposalProceeds: 50000 };
    const s = afaSchedule(a);
    const afa = s.filter((i) => i.kind === "afa").reduce((x, i) => x + i.amount, 0);
    expect(afa).toBe(36000); // 18 Monate à 20 €
    expect(s.find((i) => i.kind === "residual")?.amount).toBe(84000);
    expect(bookValue(a, new Date(2028, 0, 1))).toBe(0);
  });
});
