import { z } from "zod";

export const PositionSchema = z.object({
  partId: z.number().int().nullable(),
  name: z.string().trim().min(1, "Jede Position braucht eine Bezeichnung."),
  text: z.string(),
  quantity: z.number(),
  unit: z.string(),
  price: z.string(),
  discount: z.number().min(0).max(100),
  taxRate: z.number().min(0).max(100),
  optional: z.boolean().default(false),
});

// Gemeinsames Eingabeformat des Beleg-Editors für Rechnungen, Gutschriften und Angebote.
export const DraftSchema = z.object({
  address: z.string().trim().min(1, "Empfängeradresse fehlt."),
  date: z.string().min(1, "Datum fehlt."),
  deliveryDate: z.string(),
  deliveryDateUntil: z.string(),
  validUntil: z.string(),
  timeToPay: z.number().int().min(0),
  headText: z.string(),
  footText: z.string(),
  taxType: z.enum(["default", "eu", "noteu", "ss"]),
  discount: z.number().min(0).max(100),
  customerReference: z.string(),
  eInvoice: z.boolean(),
  positions: z.array(PositionSchema),
});

export type DraftInput = z.input<typeof DraftSchema>;
export type ActionResult = { error?: string };

export const optDate = (s: string) => (s ? new Date(s) : null);
