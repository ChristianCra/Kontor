-- CreateTable
CREATE TABLE "Asset" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "inventoryNumber" TEXT NOT NULL DEFAULT '',
    "accountingTypeId" INTEGER NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'linear',
    "acquisitionDate" DATETIME NOT NULL,
    "cost" INTEGER NOT NULL,
    "usefulLifeYears" INTEGER NOT NULL DEFAULT 1,
    "voucherId" INTEGER,
    "voucherPositionId" INTEGER,
    "disposalDate" DATETIME,
    "disposalProceeds" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Asset_accountingTypeId_fkey" FOREIGN KEY ("accountingTypeId") REFERENCES "AccountingType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Asset_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "passwordHash" TEXT NOT NULL,
    "sessionVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MailTemplate" (
    "docType" TEXT NOT NULL PRIMARY KEY,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "MailLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "docType" TEXT NOT NULL,
    "docId" INTEGER NOT NULL,
    "to" TEXT NOT NULL,
    "cc" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL,
    "messageId" TEXT NOT NULL DEFAULT '',
    "testMode" BOOLEAN NOT NULL DEFAULT false,
    "sentBy" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Asset_voucherPositionId_key" ON "Asset"("voucherPositionId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
