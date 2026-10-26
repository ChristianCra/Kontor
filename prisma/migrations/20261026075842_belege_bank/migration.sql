-- CreateTable
CREATE TABLE "AccountingType" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "skr03" TEXT NOT NULL,
    "skr04" TEXT NOT NULL,
    "defaultTaxRate" REAL NOT NULL DEFAULT 19,
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "Voucher" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "creditDebit" TEXT NOT NULL DEFAULT 'D',
    "status" INTEGER NOT NULL DEFAULT 50,
    "supplierId" INTEGER,
    "supplierName" TEXT NOT NULL DEFAULT '',
    "documentNumber" TEXT NOT NULL DEFAULT '',
    "voucherDate" DATETIME NOT NULL,
    "deliveryDate" DATETIME,
    "dueDate" DATETIME,
    "taxType" TEXT NOT NULL DEFAULT 'default',
    "description" TEXT NOT NULL DEFAULT '',
    "sumNet" INTEGER NOT NULL DEFAULT 0,
    "sumTax" INTEGER NOT NULL DEFAULT 0,
    "sumGross" INTEGER NOT NULL DEFAULT 0,
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "fileName" TEXT,
    "filePath" TEXT,
    "fileType" TEXT,
    "enshrinedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Voucher_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VoucherPosition" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "voucherId" INTEGER NOT NULL,
    "accountingTypeId" INTEGER NOT NULL,
    "taxRate" REAL NOT NULL,
    "net" BOOLEAN NOT NULL DEFAULT false,
    "amount" INTEGER NOT NULL,
    "sumNet" INTEGER NOT NULL DEFAULT 0,
    "sumTax" INTEGER NOT NULL DEFAULT 0,
    "sumGross" INTEGER NOT NULL DEFAULT 0,
    "comment" TEXT NOT NULL DEFAULT '',
    "isAsset" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "VoucherPosition_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VoucherPosition_accountingTypeId_fkey" FOREIGN KEY ("accountingTypeId") REFERENCES "AccountingType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'BANK',
    "iban" TEXT NOT NULL DEFAULT '',
    "bic" TEXT NOT NULL DEFAULT '',
    "openingBalance" INTEGER NOT NULL DEFAULT 0,
    "openingDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ledgerAccount" TEXT NOT NULL DEFAULT '1200',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "accountId" INTEGER NOT NULL,
    "valueDate" DATETIME NOT NULL,
    "entryDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" INTEGER NOT NULL,
    "payeeName" TEXT NOT NULL DEFAULT '',
    "payeeIban" TEXT NOT NULL DEFAULT '',
    "purpose" TEXT NOT NULL DEFAULT '',
    "status" INTEGER NOT NULL DEFAULT 100,
    "importHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BankAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Payment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "invoiceId" INTEGER,
    "voucherId" INTEGER,
    "transactionId" INTEGER,
    "accountId" INTEGER,
    "date" DATETIME NOT NULL,
    "amount" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Payment_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Payment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Payment" ("amount", "createdAt", "date", "id", "invoiceId", "note") SELECT "amount", "createdAt", "date", "id", "invoiceId", "note" FROM "Payment";
DROP TABLE "Payment";
ALTER TABLE "new_Payment" RENAME TO "Payment";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_importHash_key" ON "Transaction"("importHash");
