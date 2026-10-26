import type { Company, Contact, Invoice, InvoicePosition } from "@prisma/client";
import { computeTotals } from "./calc";
import { dueDate } from "./invoices";

// Erzeugt eine E-Rechnung im Format UN/CEFACT CII nach XRechnung 3.0 (EN 16931).
// Dasselbe XML wird als factur-x.xml in das PDF eingebettet.

type FullInvoice = Invoice & { positions: InvoicePosition[]; contact: Contact; parent?: Invoice | null };

const UNIT_CODES: Record<string, string> = { Stk: "H87", Std: "HUR", Tag: "DAY", Pauschal: "LS", km: "KMT", kg: "KGM", m: "MTR" };

const TAX_CATEGORY: Record<string, { code: string; reason?: string }> = {
  eu: { code: "K", reason: "Innergemeinschaftliche Lieferung / Reverse Charge" },
  noteu: { code: "G", reason: "Ausfuhrlieferung in ein Drittland" },
  ss: { code: "E", reason: "Kleinunternehmer gemäß §19 UStG" },
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const amount = (cents: number) => (cents / 100).toFixed(2);
const date102 = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
const dateTime = (d: Date) => `<udt:DateTimeString format="102">${date102(d)}</udt:DateTimeString>`;
const el = (name: string, value: string | null | undefined, attrs = "") => (value ? `<${name}${attrs}>${esc(value)}</${name}>` : "");

function category(taxType: string, rate: number) {
  if (taxType in TAX_CATEGORY) return TAX_CATEGORY[taxType];
  return rate === 0 ? { code: "Z" } : { code: "S" };
}

function typeCode(type: string): string {
  if (type === "GU") return "381"; // Gutschrift (Credit note)
  if (type === "SR") return "384"; // Korrigierte Rechnung
  if (type === "AR" || type === "TR") return "326"; // Teil-/Abschlagsrechnung
  return "380";
}

function splitAddress(address: string) {
  // Empfängeradresse als Freitext: erste Zeile Name, letzte Zeile mit PLZ/Ort
  const lines = address.split("\n").map((l) => l.trim()).filter(Boolean);
  const cityLine = [...lines].reverse().find((l) => /^\d{4,5}\s/.test(l)) ?? "";
  const [, zip = "", city = ""] = cityLine.match(/^(\d{4,5})\s+(.*)$/) ?? [];
  const street = lines.find((l, i) => i > 0 && l !== cityLine && !/^[A-Z]{2}$/.test(l)) ?? "";
  const country = lines.find((l) => /^[A-Z]{2}$/.test(l)) ?? "DE";
  return { name: lines[0] ?? "", street, zip, city, country };
}

function address(a: { street: string; zip: string; city: string; country: string }) {
  return `<ram:PostalTradeAddress>${el("ram:PostcodeCode", a.zip)}${el("ram:LineOne", a.street)}${el("ram:CityName", a.city)}<ram:CountryID>${esc(a.country || "DE")}</ram:CountryID></ram:PostalTradeAddress>`;
}

export function buildXRechnung(inv: FullInvoice, company: Company): string {
  const positions = [...inv.positions].sort((a, b) => a.position - b.position);
  const totals = computeTotals(positions, inv.taxType, inv.discount);
  const lineTotal = totals.positions.reduce((s, n) => s + n, 0);
  const allowance = lineTotal - totals.net;
  const buyer = splitAddress(inv.address);
  const buyerReference = inv.contact.buyerReference || inv.customerReference || inv.contact.customerNumber;

  const lines = positions
    .map((p, i) => {
      const cat = category(inv.taxType, p.taxRate);
      const netUnit = (p.priceNet * (1 - p.discount / 100)) / 100;
      return `<ram:IncludedSupplyChainTradeLineItem>
<ram:AssociatedDocumentLineDocument><ram:LineID>${i + 1}</ram:LineID></ram:AssociatedDocumentLineDocument>
<ram:SpecifiedTradeProduct>${el("ram:Name", p.name)}${el("ram:Description", p.text)}</ram:SpecifiedTradeProduct>
<ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>${netUnit.toFixed(4)}</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>
<ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="${UNIT_CODES[p.unit] ?? "C62"}">${p.quantity}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>
<ram:SpecifiedLineTradeSettlement>
<ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>${cat.code}</ram:CategoryCode><ram:RateApplicablePercent>${cat.code === "S" ? p.taxRate : 0}</ram:RateApplicablePercent></ram:ApplicableTradeTax>
<ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${amount(totals.positions[i])}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>
</ram:SpecifiedLineTradeSettlement>
</ram:IncludedSupplyChainTradeLineItem>`;
    })
    .join("\n");

  // Steuerkategorien je Satz; Gesamtrabatt wird je Kategorie als Abschlag ausgewiesen
  const groupLineNets = new Map<number, number>();
  positions.forEach((p, i) => {
    const rate = inv.taxType === "default" ? p.taxRate : 0;
    groupLineNets.set(rate, (groupLineNets.get(rate) ?? 0) + totals.positions[i]);
  });
  const taxes = totals.taxGroups
    .map((g) => {
      const cat = category(inv.taxType, g.rate);
      return `<ram:ApplicableTradeTax><ram:CalculatedAmount>${amount(g.tax)}</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode>${el("ram:ExemptionReason", cat.reason)}<ram:BasisAmount>${amount(g.net)}</ram:BasisAmount><ram:CategoryCode>${cat.code}</ram:CategoryCode><ram:RateApplicablePercent>${g.rate}</ram:RateApplicablePercent></ram:ApplicableTradeTax>`;
    })
    .join("");
  const allowances = inv.discount
    ? totals.taxGroups
        .map((g) => {
          const cat = category(inv.taxType, g.rate);
          const actual = (groupLineNets.get(g.rate) ?? 0) - g.net;
          return `<ram:SpecifiedTradeAllowanceCharge><ram:ChargeIndicator><udt:Indicator>false</udt:Indicator></ram:ChargeIndicator><ram:CalculationPercent>${inv.discount}</ram:CalculationPercent><ram:BasisAmount>${amount(groupLineNets.get(g.rate) ?? 0)}</ram:BasisAmount><ram:ActualAmount>${amount(actual)}</ram:ActualAmount><ram:Reason>Rabatt</ram:Reason><ram:CategoryTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>${cat.code}</ram:CategoryCode><ram:RateApplicablePercent>${g.rate}</ram:RateApplicablePercent></ram:CategoryTradeTax></ram:SpecifiedTradeAllowanceCharge>`;
        })
        .join("")
    : "";

  const sellerTax = [
    company.vatId ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(company.vatId)}</ram:ID></ram:SpecifiedTaxRegistration>` : "",
    company.taxNumber ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">${esc(company.taxNumber)}</ram:ID></ram:SpecifiedTaxRegistration>` : "",
  ].join("");
  const due = ["RE", "AR", "TR", "ER"].includes(inv.type) ? dueDate(inv) : null;
  const open = inv.sumGross - inv.paidAmount;
  const period =
    inv.deliveryDate && inv.deliveryDateUntil
      ? `<ram:BillingSpecifiedPeriod><ram:StartDateTime>${dateTime(inv.deliveryDate)}</ram:StartDateTime><ram:EndDateTime>${dateTime(inv.deliveryDateUntil)}</ram:EndDateTime></ram:BillingSpecifiedPeriod>`
      : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100">
<rsm:ExchangedDocumentContext>
<ram:BusinessProcessSpecifiedDocumentContextParameter><ram:ID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</ram:ID></ram:BusinessProcessSpecifiedDocumentContextParameter>
<ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter>
</rsm:ExchangedDocumentContext>
<rsm:ExchangedDocument>
<ram:ID>${esc(inv.invoiceNumber ?? "")}</ram:ID>
<ram:TypeCode>${typeCode(inv.type)}</ram:TypeCode>
<ram:IssueDateTime>${dateTime(inv.invoiceDate)}</ram:IssueDateTime>
${inv.headText ? `<ram:IncludedNote><ram:Content>${esc(inv.headText.replace(/<[^>]+>/g, ""))}</ram:Content></ram:IncludedNote>` : ""}
</rsm:ExchangedDocument>
<rsm:SupplyChainTradeTransaction>
${lines}
<ram:ApplicableHeaderTradeAgreement>
<ram:BuyerReference>${esc(buyerReference)}</ram:BuyerReference>
<ram:SellerTradeParty>
<ram:Name>${esc(company.name)}</ram:Name>
<ram:DefinedTradeContact><ram:PersonName>${esc(company.name)}</ram:PersonName>${company.phone ? `<ram:TelephoneUniversalCommunication><ram:CompleteNumber>${esc(company.phone)}</ram:CompleteNumber></ram:TelephoneUniversalCommunication>` : ""}${company.email ? `<ram:EmailURIUniversalCommunication><ram:URIID>${esc(company.email)}</ram:URIID></ram:EmailURIUniversalCommunication>` : ""}</ram:DefinedTradeContact>
${address(company)}
${company.email ? `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${esc(company.email)}</ram:URIID></ram:URIUniversalCommunication>` : ""}
${sellerTax}
</ram:SellerTradeParty>
<ram:BuyerTradeParty>
<ram:Name>${esc(buyer.name)}</ram:Name>
${address(buyer)}
${inv.contact.email ? `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${esc(inv.contact.email)}</ram:URIID></ram:URIUniversalCommunication>` : ""}
${inv.contact.vatId ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(inv.contact.vatId)}</ram:ID></ram:SpecifiedTaxRegistration>` : ""}
</ram:BuyerTradeParty>
</ram:ApplicableHeaderTradeAgreement>
<ram:ApplicableHeaderTradeDelivery>
${inv.deliveryDate ? `<ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime>${dateTime(inv.deliveryDate)}</ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent>` : ""}
</ram:ApplicableHeaderTradeDelivery>
<ram:ApplicableHeaderTradeSettlement>
<ram:PaymentReference>${esc(inv.invoiceNumber ?? "")}</ram:PaymentReference>
<ram:InvoiceCurrencyCode>${esc(inv.currency)}</ram:InvoiceCurrencyCode>
${company.iban ? `<ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>58</ram:TypeCode><ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${esc(company.iban.replace(/\s/g, ""))}</ram:IBANID></ram:PayeePartyCreditorFinancialAccount></ram:SpecifiedTradeSettlementPaymentMeans>` : ""}
${taxes}
${period}
${allowances}
<ram:SpecifiedTradePaymentTerms>${due ? `<ram:Description>Zahlbar bis ${due.toLocaleDateString("de-DE")} ohne Abzug.</ram:Description><ram:DueDateDateTime>${dateTime(due)}</ram:DueDateDateTime>` : "<ram:Description>Keine Zahlung erforderlich.</ram:Description>"}</ram:SpecifiedTradePaymentTerms>
<ram:SpecifiedTradeSettlementHeaderMonetarySummation>
<ram:LineTotalAmount>${amount(lineTotal)}</ram:LineTotalAmount>
${inv.discount ? `<ram:AllowanceTotalAmount>${amount(allowance)}</ram:AllowanceTotalAmount>` : ""}
<ram:TaxBasisTotalAmount>${amount(totals.net)}</ram:TaxBasisTotalAmount>
<ram:TaxTotalAmount currencyID="${esc(inv.currency)}">${amount(totals.tax)}</ram:TaxTotalAmount>
<ram:GrandTotalAmount>${amount(totals.gross)}</ram:GrandTotalAmount>
<ram:TotalPrepaidAmount>${amount(inv.paidAmount)}</ram:TotalPrepaidAmount>
<ram:DuePayableAmount>${amount(open)}</ram:DuePayableAmount>
</ram:SpecifiedTradeSettlementHeaderMonetarySummation>
${inv.parent?.invoiceNumber ? `<ram:InvoiceReferencedDocument><ram:IssuerAssignedID>${esc(inv.parent.invoiceNumber)}</ram:IssuerAssignedID><ram:FormattedIssueDateTime><qdt:DateTimeString format="102">${date102(inv.parent.invoiceDate)}</qdt:DateTimeString></ram:FormattedIssueDateTime></ram:InvoiceReferencedDocument>` : ""}
</ram:ApplicableHeaderTradeSettlement>
</rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`
    .split("\n")
    .filter((l) => l.trim())
    .join("\n");
}
