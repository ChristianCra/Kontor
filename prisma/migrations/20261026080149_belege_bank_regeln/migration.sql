-- CreateTable
CREATE TABLE "PrivateRule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "payeeName" TEXT NOT NULL DEFAULT '',
    "purpose" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Voucher" (
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
    "net" BOOLEAN NOT NULL DEFAULT false,
    "supplierIban" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "sumNet" INTEGER NOT NULL DEFAULT 0,
    "sumTax" INTEGER NOT NULL DEFAULT 0,
    "sumGross" INTEGER NOT NULL DEFAULT 0,
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "fileName" TEXT,
    "filePath" TEXT,
    "fileType" TEXT,
    "fileHash" TEXT,
    "enshrinedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Voucher_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Voucher" ("createdAt", "creditDebit", "deliveryDate", "description", "documentNumber", "dueDate", "enshrinedAt", "fileName", "filePath", "fileType", "id", "paidAmount", "status", "sumGross", "sumNet", "sumTax", "supplierId", "supplierName", "taxType", "updatedAt", "voucherDate") SELECT "createdAt", "creditDebit", "deliveryDate", "description", "documentNumber", "dueDate", "enshrinedAt", "fileName", "filePath", "fileType", "id", "paidAmount", "status", "sumGross", "sumNet", "sumTax", "supplierId", "supplierName", "taxType", "updatedAt", "voucherDate" FROM "Voucher";
DROP TABLE "Voucher";
ALTER TABLE "new_Voucher" RENAME TO "Voucher";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
