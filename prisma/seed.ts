import { PrismaClient } from "@prisma/client";

import { DEFAULT_ACCOUNTING_TYPES } from "../src/lib/accounts-data";

const db = new PrismaClient();

async function main() {
  if ((await db.accountingType.count()) === 0) await db.accountingType.createMany({ data: DEFAULT_ACCOUNTING_TYPES });
  if ((await db.bankAccount.count()) === 0) {
    await db.bankAccount.createMany({
      data: [
        { name: "Geschäftskonto", type: "BANK", iban: "DE02120300000000202051", ledgerAccount: "1200" },
        { name: "Kasse", type: "CASH", ledgerAccount: "1000" },
      ],
    });
  }
  await db.company.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: "Muster Design GmbH",
      street: "Hauptstraße 1",
      zip: "10115",
      city: "Berlin",
      email: "info@muster-design.example",
      phone: "+49 30 1234567",
      taxNumber: "30/123/45678",
      vatId: "DE123456789",
      bankName: "Musterbank",
      iban: "DE02120300000000202051",
      bic: "BYLADEM1001",
    },
  });
  for (const name of ["Stk", "Std", "Tag", "Pauschal", "km"]) {
    await db.unit.upsert({ where: { name }, update: {}, create: { name } });
  }
  const std = await db.unit.findUniqueOrThrow({ where: { name: "Std" } });
  await db.part.upsert({
    where: { partNumber: "1001" },
    update: {},
    create: { partNumber: "1001", name: "Beratung", text: "Beratungsleistung nach Aufwand", unitId: std.id, priceNet: 9500 },
  });
  if ((await db.contact.count()) === 0) {
    await db.numberSequence.upsert({ where: { type: "CUSTOMER" }, update: {}, create: { type: "CUSTOMER", format: "{NNNN}", next: 1001 } });
    const seq = await db.numberSequence.update({ where: { type: "CUSTOMER" }, data: { next: { increment: 1 } } });
    await db.contact.create({
      data: {
        customerNumber: String(seq.next - 1),
        name: "Beispiel AG",
        email: "buchhaltung@beispiel.example",
        addresses: { create: { street: "Marktplatz 5", zip: "80331", city: "München" } },
      },
    });
  }
}

main().finally(() => db.$disconnect());
