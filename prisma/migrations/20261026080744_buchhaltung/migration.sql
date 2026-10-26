-- CreateTable
CREATE TABLE "DatevExport" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "from" DATETIME NOT NULL,
    "to" DATETIME NOT NULL,
    "lines" INTEGER NOT NULL,
    "enshrined" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Company" (
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
    "defaultTimeToPay" INTEGER NOT NULL DEFAULT 14,
    "chartOfAccounts" TEXT NOT NULL DEFAULT 'skr03',
    "cashAccounting" BOOLEAN NOT NULL DEFAULT true,
    "vatPeriod" TEXT NOT NULL DEFAULT 'QUARTER',
    "datevAdvisor" TEXT NOT NULL DEFAULT '',
    "datevClient" TEXT NOT NULL DEFAULT '',
    "fiscalYearStart" INTEGER NOT NULL DEFAULT 1
);
INSERT INTO "new_Company" ("bankName", "bic", "chartOfAccounts", "city", "country", "defaultTimeToPay", "email", "iban", "id", "name", "phone", "smallBusiness", "street", "taxNumber", "vatId", "zip") SELECT "bankName", "bic", "chartOfAccounts", "city", "country", "defaultTimeToPay", "email", "iban", "id", "name", "phone", "smallBusiness", "street", "taxNumber", "vatId", "zip" FROM "Company";
DROP TABLE "Company";
ALTER TABLE "new_Company" RENAME TO "Company";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
