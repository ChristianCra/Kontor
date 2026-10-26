import { describe, expect, it } from "vitest";
import { parseCamt, parseCsv } from "./bankimport";
import { suggestMatches } from "./matching";

describe("parseCsv", () => {
  it("liest Sparkassen-Format mit Semikolon und deutschen Beträgen", () => {
    const csv = [
      '"Auftragskonto";"Buchungstag";"Valutadatum";"Buchungstext";"Verwendungszweck";"Beguenstigter/Zahlungspflichtiger";"Kontonummer/IBAN";"BIC (SWIFT-Code)";"Betrag";"Waehrung";"Info"',
      '"DE02120300000000202051";"27.10.26";"27.10.26";"GUTSCHR. UEBERWEISUNG";"RE-2026-0001 Danke";"Testkunde GmbH";"DE89370400440532013000";"COBADEFFXXX";"1.234,56";"EUR";"Umsatz gebucht"',
      '"DE02120300000000202051";"28.10.26";"28.10.26";"LASTSCHRIFT";"Rechnung 4711";"Telekom Deutschland GmbH";"DE12500105170648489890";"INGDDEFFXXX";"-39,95";"EUR";"Umsatz gebucht"',
    ].join("\n");
    const t = parseCsv(csv);
    expect(t).toHaveLength(2);
    expect(t[0]).toMatchObject({ amount: 123456, payeeName: "Testkunde GmbH", payeeIban: "DE89370400440532013000", purpose: "RE-2026-0001 Danke" });
    expect(t[0].valueDate.toISOString().slice(0, 10)).toBe("2026-10-27");
    expect(t[1].amount).toBe(-3995);
  });

  it("überspringt Metadaten vor der Kopfzeile", () => {
    const csv = ['Kontonummer:;DE02...;', 'Zeitraum:;01.10.2026 - 31.10.2026;', '', 'Buchungsdatum;Wertstellung;Name Zahlungsbeteiligter;IBAN Zahlungsbeteiligter;Verwendungszweck;Betrag (€)', '01.10.2026;01.10.2026;Vermieter;DE111;Miete Oktober;-800,00'].join("\n");
    expect(parseCsv(csv)[0]).toMatchObject({ amount: -80000, payeeName: "Vermieter", purpose: "Miete Oktober" });
  });
});

describe("parseCamt", () => {
  it("liest Gutschriften und Lastschriften", () => {
    const xml = `<?xml version="1.0"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt><Stmt>
      <Ntry><Amt Ccy="EUR">100.50</Amt><CdtDbtInd>CRDT</CdtDbtInd><ValDt><Dt>2026-10-27</Dt></ValDt>
        <NtryDtls><TxDtls><RltdPties><Dbtr><Nm>Kunde AG</Nm></Dbtr><DbtrAcct><Id><IBAN>DE11</IBAN></Id></DbtrAcct></RltdPties><RmtInf><Ustrd>RE-2026-0002</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>
      <Ntry><Amt Ccy="EUR">20.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><ValDt><Dt>2026-10-28</Dt></ValDt>
        <NtryDtls><TxDtls><RltdPties><Cdtr><Nm>Bürohandel</Nm></Cdtr><CdtrAcct><Id><IBAN>DE22</IBAN></Id></CdtrAcct></RltdPties><RmtInf><Ustrd>Papier</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>
    </Stmt></BkToCstmrStmt></Document>`;
    const t = parseCamt(xml);
    expect(t[0]).toMatchObject({ amount: 10050, payeeName: "Kunde AG", payeeIban: "DE11", purpose: "RE-2026-0002" });
    expect(t[1]).toMatchObject({ amount: -2000, payeeName: "Bürohandel", payeeIban: "DE22" });
  });
});

describe("suggestMatches", () => {
  const items = [
    { kind: "invoice" as const, id: 1, number: "RE-2026-0001", name: "Testkunde GmbH", open: 123456, date: new Date() },
    { kind: "invoice" as const, id: 2, number: "RE-2026-0002", name: "Andere AG", open: 123456, date: new Date() },
    { kind: "voucher" as const, id: 3, number: "4711", name: "Telekom Deutschland GmbH", open: 3995, date: new Date() },
  ];
  it("bevorzugt Nummer im Verwendungszweck", () => {
    const s = suggestMatches({ amount: 123456, payeeName: "Testkunde GmbH", purpose: "RE-2026-0001 Danke" }, items);
    expect(s[0].id).toBe(1);
    expect(s[0].reasons).toContain("Nummer im Verwendungszweck");
  });
  it("ordnet Ausgaben nur Belegen zu", () => {
    const s = suggestMatches({ amount: -3995, payeeName: "Telekom Deutschland GmbH", purpose: "Rechnung 4711" }, items);
    expect(s.map((x) => x.id)).toEqual([3]);
  });
});
