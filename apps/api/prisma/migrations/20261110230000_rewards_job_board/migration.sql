-- CreateEnum
CREATE TYPE "RewardCurrency" AS ENUM ('NONE', 'MONEY', 'POINTS');

-- CreateEnum
CREATE TYPE "ChoreKind" AS ENUM ('ROUTINE', 'EXTRA_JOB');

-- CreateEnum
CREATE TYPE "BoardState" AS ENUM ('NONE', 'OPEN', 'CLAIMED');

-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM ('EARNED', 'PAYOUT', 'REDEMPTION', 'REDEMPTION_REFUND', 'CORRECTION');

-- CreateEnum
CREATE TYPE "RedemptionStatus" AS ENUM ('REQUESTED', 'APPROVED', 'DENIED', 'CANCELED');

-- AlterEnum
ALTER TYPE "AssignMode" ADD VALUE 'OPEN';

-- AlterTable
ALTER TABLE "Chore" ADD COLUMN     "kind" "ChoreKind" NOT NULL DEFAULT 'ROUTINE';

-- AlterTable
ALTER TABLE "ChoreInstance" ADD COLUMN     "board" "BoardState" NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "Family" ADD COLUMN     "currencyCode" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "rewardCurrency" "RewardCurrency" NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "Membership" DROP COLUMN "pointsBalance";

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "currency" "RewardCurrency" NOT NULL,
    "currencyCode" TEXT,
    "amount" INTEGER NOT NULL,
    "type" "LedgerType" NOT NULL,
    "instanceId" UUID,
    "redemptionId" UUID,
    "note" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardItem" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "cost" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RewardItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Redemption" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "itemName" TEXT NOT NULL,
    "cost" INTEGER NOT NULL,
    "status" "RedemptionStatus" NOT NULL DEFAULT 'REQUESTED',
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Redemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LedgerEntry_familyId_membershipId_currency_idx" ON "LedgerEntry"("familyId", "membershipId", "currency");

-- CreateIndex
CREATE INDEX "LedgerEntry_membershipId_createdAt_idx" ON "LedgerEntry"("membershipId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_instanceId_membershipId_type_key" ON "LedgerEntry"("instanceId", "membershipId", "type");

-- CreateIndex
CREATE INDEX "RewardItem_familyId_idx" ON "RewardItem"("familyId");

-- CreateIndex
CREATE INDEX "Redemption_familyId_status_idx" ON "Redemption"("familyId", "status");

-- CreateIndex
CREATE INDEX "Redemption_membershipId_idx" ON "Redemption"("membershipId");

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "ChoreInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_redemptionId_fkey" FOREIGN KEY ("redemptionId") REFERENCES "Redemption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardItem" ADD CONSTRAINT "RewardItem_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "RewardItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

