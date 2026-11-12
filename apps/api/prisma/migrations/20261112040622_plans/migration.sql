-- CreateEnum
CREATE TYPE "BillingStore" AS ENUM ('APP_STORE', 'PLAY_STORE', 'WEB', 'PROMOTIONAL', 'OTHER');

-- AlterTable
ALTER TABLE "Family" ADD COLUMN     "trialEndsAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Subscription" (
    "familyId" UUID NOT NULL,
    "store" "BillingStore",
    "productId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "willRenew" BOOLEAN NOT NULL DEFAULT false,
    "checkedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("familyId")
);

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

