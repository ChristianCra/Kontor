-- CreateTable
CREATE TABLE "Company" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "name" TEXT NOT NULL,
    "street" TEXT NOT NULL DEFAULT '',
    "zip" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT 'DE',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "taxNumber" TEXT NOT NULL DEFAULT '',
    "vatId" TEXT NOT NULL DEFAULT '',
    "iban" TEXT NOT NULL DEFAULT '',
    "bic" TEXT NOT NULL DEFAULT '',
    "bankName" TEXT NOT NULL DEFAULT '',
    "smallBusiness" BOOLEAN NOT NULL DEFAULT false,
    "defaultTimeToPay" INTEGER NOT NULL DEFAULT 14
);

-- CreateTable
CREATE TABLE "NumberSequence" (
    "type" TEXT NOT NULL PRIMARY KEY,
    "format" TEXT NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 1
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "customerNumber" TEXT NOT NULL,
    "name" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "category" TEXT NOT NULL DEFAULT 'CUSTOMER',
    "status" INTEGER NOT NULL DEFAULT 1000,
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "vatId" TEXT NOT NULL DEFAULT '',
    "taxNumber" TEXT NOT NULL DEFAULT '',
    "iban" TEXT NOT NULL DEFAULT '',
    "buyerReference" TEXT NOT NULL DEFAULT '',
    "defaultTimeToPay" INTEGER,
    "defaultDiscount" REAL NOT NULL DEFAULT 0,
    "taxType" TEXT NOT NULL DEFAULT 'default',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ContactAddress" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "contactId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'BILLING',
    "street" TEXT NOT NULL DEFAULT '',
    "zip" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT 'DE',
    CONSTRAINT "ContactAddress_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Part" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "partNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "unitId" INTEGER NOT NULL,
    "priceNet" INTEGER NOT NULL,
    "pricePurchase" INTEGER NOT NULL DEFAULT 0,
    "taxRate" REAL NOT NULL DEFAULT 19,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Part_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Invoice" (
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
    "cancelsId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Invoice_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Invoice_cancelsId_fkey" FOREIGN KEY ("cancelsId") REFERENCES "Invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InvoicePosition" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "invoiceId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "partId" INTEGER,
    "name" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "quantity" REAL NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'Stk',
    "priceNet" INTEGER NOT NULL,
    "discount" REAL NOT NULL DEFAULT 0,
    "taxRate" REAL NOT NULL,
    CONSTRAINT "InvoicePosition_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "invoiceId" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "amount" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Contact_customerNumber_key" ON "Contact"("customerNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_name_key" ON "Unit"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Part_partNumber_key" ON "Part"("partNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_cancelsId_key" ON "Invoice"("cancelsId");
