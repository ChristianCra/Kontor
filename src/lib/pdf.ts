import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { Company, Contact, Invoice, InvoicePosition } from "@prisma/client";
import { computeTotals } from "./calc";
import { formatCents, formatDate } from "./money";
import { dueDate } from "./invoices";

type FullInvoice = Invoice & { positions: InvoicePosition[]; contact: Contact };

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 56;
const GREY = rgb(0.4, 0.4, 0.4);

// Bricht Text an Wortgrenzen um, sodass jede Zeile in maxWidth passt.
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

function stripHtml(s: string): string {
  return s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "");
}

export async function renderInvoicePdf(inv: FullInvoice, company: Company): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(inv.header);
  doc.setAuthor(company.name);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const width = A4[0] - 2 * MARGIN;

  let page: PDFPage = doc.addPage(A4);
  let y = A4[1] - MARGIN;

  const text = (s: string, x: number, yy: number, opts: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb> } = {}) =>
    page.drawText(s, { x, y: yy, size: opts.size ?? 10, font: opts.f ?? font, color: opts.color ?? rgb(0, 0, 0) });
  const right = (s: string, xRight: number, yy: number, size = 10, f = font) =>
    text(s, xRight - f.widthOfTextAtSize(s, size), yy, { size, f });

  const footer = () => {
    const parts = [
      [company.name, company.street, `${company.zip} ${company.city}`].filter(Boolean),
      [company.email, company.phone, company.vatId ? `USt-IdNr. ${company.vatId}` : company.taxNumber ? `St.-Nr. ${company.taxNumber}` : ""].filter(Boolean),
      [company.bankName, company.iban ? `IBAN ${company.iban}` : "", company.bic ? `BIC ${company.bic}` : ""].filter(Boolean),
    ];
    parts.forEach((cols, i) => text(cols.join(" · "), MARGIN, 40 - i * 10, { size: 7, color: GREY }));
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < 90) {
      footer();
      page = doc.addPage(A4);
      y = A4[1] - MARGIN;
    }
  };

  // Absenderzeile und Empfänger
  text([company.name, company.street, `${company.zip} ${company.city}`].filter(Boolean).join(" · "), MARGIN, y - 90, { size: 7, color: GREY });
  inv.address.split("\n").forEach((line, i) => text(line, MARGIN, y - 108 - i * 13));

  // Metadaten rechts
  const meta: [string, string][] = [
    [inv.type === "SR" ? "Stornonummer" : "Rechnungsnummer", inv.invoiceNumber ?? "ENTWURF"],
    ["Rechnungsdatum", formatDate(inv.invoiceDate)],
    ...(inv.deliveryDate
      ? [["Leistungsdatum", inv.deliveryDateUntil ? `${formatDate(inv.deliveryDate)} – ${formatDate(inv.deliveryDateUntil)}` : formatDate(inv.deliveryDate)] as [string, string]]
      : []),
    ["Kundennummer", inv.contact.customerNumber],
    ...(inv.customerReference ? [["Ihre Referenz", inv.customerReference] as [string, string]] : []),
  ];
  meta.forEach(([k, v], i) => {
    text(k, A4[0] - MARGIN - 200, y - 108 - i * 13, { size: 9, color: GREY });
    right(v, A4[0] - MARGIN, y - 108 - i * 13, 9);
  });

  y -= 230;
  text(inv.invoiceNumber ? inv.header : `${inv.header} (Entwurf)`, MARGIN, y, { size: 16, f: bold });
  y -= 24;
  for (const line of wrap(stripHtml(inv.headText), font, 10, width)) {
    ensureSpace(14);
    text(line, MARGIN, y);
    y -= 14;
  }
  y -= 10;

  // Positionstabelle
  const cols = { pos: MARGIN, name: MARGIN + 28, qty: MARGIN + 300, price: MARGIN + 400, total: A4[0] - MARGIN };
  const tableHeader = () => {
    text("Pos.", cols.pos, y, { size: 9, f: bold });
    text("Bezeichnung", cols.name, y, { size: 9, f: bold });
    right("Menge", cols.qty, y, 9, bold);
    right("Einzelpreis", cols.price, y, 9, bold);
    right("Gesamt", cols.total, y, 9, bold);
    y -= 6;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: A4[0] - MARGIN, y }, thickness: 0.5, color: GREY });
    y -= 14;
  };
  tableHeader();

  const totals = computeTotals(inv.positions, inv.taxType, inv.discount);
  const positions = [...inv.positions].sort((a, b) => a.position - b.position);
  positions.forEach((p, i) => {
    const desc = p.text ? wrap(stripHtml(p.text), font, 8, 260) : [];
    const needed = 14 + desc.length * 11;
    if (y - needed < 90) {
      ensureSpace(needed + 200);
      tableHeader();
    }
    text(String(i + 1), cols.pos, y, { size: 9 });
    text(p.name, cols.name, y, { size: 9 });
    right(`${p.quantity.toLocaleString("de-DE")} ${p.unit}`, cols.qty, y, 9);
    right(formatCents(p.priceNet, inv.currency) + (p.discount ? ` (-${p.discount}%)` : ""), cols.price, y, 9);
    right(formatCents(totals.positions[i], inv.currency), cols.total, y, 9);
    y -= 12;
    desc.forEach((d) => {
      text(d, cols.name, y, { size: 8, color: GREY });
      y -= 11;
    });
    y -= 4;
  });

  // Summen
  ensureSpace(40 + totals.taxGroups.length * 14);
  page.drawLine({ start: { x: MARGIN + 260, y: y + 4 }, end: { x: A4[0] - MARGIN, y: y + 4 }, thickness: 0.5, color: GREY });
  y -= 10;
  const sumRow = (label: string, value: number, f = font) => {
    text(label, MARGIN + 260, y, { size: 10, f });
    right(formatCents(value, inv.currency), A4[0] - MARGIN, y, 10, f);
    y -= 14;
  };
  if (inv.discount) sumRow(`abzgl. ${inv.discount}% Rabatt enthalten`, 0);
  sumRow("Summe netto", totals.net);
  for (const g of totals.taxGroups) if (g.rate > 0) sumRow(`Umsatzsteuer ${g.rate.toLocaleString("de-DE")}%`, g.tax);
  sumRow("Gesamtbetrag", totals.gross, bold);
  y -= 10;

  const notes: string[] = [];
  if (inv.taxType === "ss") notes.push("Gemäß §19 UStG wird keine Umsatzsteuer berechnet.");
  if (inv.taxType === "eu") notes.push("Steuerfreie innergemeinschaftliche Lieferung bzw. Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge).");
  if (inv.taxType === "noteu") notes.push("Steuerfreie Ausfuhrlieferung bzw. nicht im Inland steuerbare Leistung.");
  if (inv.type !== "SR" && inv.timeToPay > 0)
    notes.push(`Bitte überweisen Sie den Betrag bis zum ${formatDate(dueDate(inv))} unter Angabe der Rechnungsnummer.`);
  if (inv.footText) notes.push(stripHtml(inv.footText));
  for (const line of notes.flatMap((n) => wrap(n, font, 10, width))) {
    ensureSpace(14);
    text(line, MARGIN, y);
    y -= 14;
  }

  footer();
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const label = `Seite ${i + 1} von ${pages.length}`;
    p.drawText(label, { x: A4[0] - MARGIN - font.widthOfTextAtSize(label, 7), y: 40, size: 7, font, color: GREY });
  });
  return doc.save();
}
