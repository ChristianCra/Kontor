-- CreateTable
CREATE TABLE "Order" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderNumber" TEXT,
    "type" TEXT NOT NULL DEFAULT 'AN',
    "status" INTEGER NOT NULL DEFAULT 100,
    "contactId" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "orderDate" DATETIME NOT NULL,
    "validUntil" DATETIME,
    "header" TEXT NOT NULL DEFAULT 'Angebot',
    "headText" TEXT NOT NULL DEFAULT '',
    "footText" TEXT NOT NULL DEFAULT '',
    "taxType" TEXT NOT NULL DEFAULT 'default',
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "discount" REAL NOT NULL DEFAULT 0,
    "customerReference" TEXT NOT NULL DEFAULT '',
    "sumNet" INTEGER NOT NULL DEFAULT 0,
    "sumTax" INTEGER NOT NULL DEFAULT 0,
    "sumGross" INTEGER NOT NULL DEFAULT 0,
    "sentAt" DATETIME,
    "parentId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Order_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderPosition" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "partId" INTEGER,
    "name" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "quantity" REAL NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'Stk',
    "priceNet" INTEGER NOT NULL,
    "discount" REAL NOT NULL DEFAULT 0,
    "taxRate" REAL NOT NULL,
    "optional" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "OrderPosition_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Invoice" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "invoiceNumber" TEXT,
    "type" TEXT NOT NULL DEFAULT 'RE',
    "status" INTEGER NOT NULL DEFAULT 100,
    "contactId" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "invoiceDate" DATETIME NOT NULL,
    "deliveryDate" DATETIME,
    "deliveryDateUntil" DATETIME,
    "timeToPay" INTEGER NOT NULL DEFAULT 14,
    "header" TEXT NOT NULL DEFAULT 'Rechnung',
    "headText" TEXT NOT NULL DEFAULT '',
    "footText" TEXT NOT NULL DEFAULT '',
    "taxType" TEXT NOT NULL DEFAULT 'default',
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "showNet" BOOLEAN NOT NULL DEFAULT true,
    "discount" REAL NOT NULL DEFAULT 0,
    "customerReference" TEXT NOT NULL DEFAULT '',
    "sumNet" INTEGER NOT NULL DEFAULT 0,
    "sumTax" INTEGER NOT NULL DEFAULT 0,
    "sumGross" INTEGER NOT NULL DEFAULT 0,
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "dunningLevel" INTEGER NOT NULL DEFAULT 0,
    "sentAt" DATETIME,
    "enshrinedAt" DATETIME,
    "parentId" INTEGER,
    "orderId" INTEGER,
    "eInvoice" BOOLEAN NOT NULL DEFAULT false,
    "cancelsId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Invoice_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Invoice_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Invoice_cancelsId_fkey" FOREIGN KEY ("cancelsId") REFERENCES "Invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Invoice" ("address", "cancelsId", "contactId", "createdAt", "currency", "customerReference", "deliveryDate", "deliveryDateUntil", "discount", "dunningLevel", "enshrinedAt", "footText", "headText", "header", "id", "invoiceDate", "invoiceNumber", "paidAmount", "sentAt", "showNet", "status", "sumGross", "sumNet", "sumTax", "taxType", "timeToPay", "type", "updatedAt") SELECT "address", "cancelsId", "contactId", "createdAt", "currency", "customerReference", "deliveryDate", "deliveryDateUntil", "discount", "dunningLevel", "enshrinedAt", "footText", "headText", "header", "id", "invoiceDate", "invoiceNumber", "paidAmount", "sentAt", "showNet", "status", "sumGross", "sumNet", "sumTax", "taxType", "timeToPay", "type", "updatedAt" FROM "Invoice";
DROP TABLE "Invoice";
ALTER TABLE "new_Invoice" RENAME TO "Invoice";
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");
CREATE UNIQUE INDEX "Invoice_cancelsId_key" ON "Invoice"("cancelsId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");
