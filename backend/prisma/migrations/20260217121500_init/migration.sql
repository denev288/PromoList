-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ListItemType" AS ENUM ('generic', 'preferred');

-- CreateEnum
CREATE TYPE "StoreCode" AS ENUM ('lidl', 'kaufland', 'billa');

-- CreateTable
CREATE TABLE "ListItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ListItemType" NOT NULL,
    "preferredQuery" TEXT,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "code" "StoreCode" NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "titleRaw" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "priceValue" DECIMAL(10,2) NOT NULL,
    "priceUnit" TEXT NOT NULL,
    "promo" BOOLEAN NOT NULL DEFAULT false,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferMatch" (
    "id" TEXT NOT NULL,
    "listItemId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ListItem_favorite_createdAt_idx" ON "ListItem"("favorite", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Store_code_key" ON "Store"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Offer_fingerprint_key" ON "Offer"("fingerprint");

-- CreateIndex
CREATE INDEX "Offer_storeId_idx" ON "Offer"("storeId");

-- CreateIndex
CREATE INDEX "Offer_normalizedTitle_idx" ON "Offer"("normalizedTitle");

-- CreateIndex
CREATE INDEX "Offer_priceValue_idx" ON "Offer"("priceValue");

-- CreateIndex
CREATE INDEX "OfferMatch_listItemId_score_idx" ON "OfferMatch"("listItemId", "score");

-- CreateIndex
CREATE UNIQUE INDEX "OfferMatch_listItemId_offerId_key" ON "OfferMatch"("listItemId", "offerId");

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferMatch" ADD CONSTRAINT "OfferMatch_listItemId_fkey" FOREIGN KEY ("listItemId") REFERENCES "ListItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferMatch" ADD CONSTRAINT "OfferMatch_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

