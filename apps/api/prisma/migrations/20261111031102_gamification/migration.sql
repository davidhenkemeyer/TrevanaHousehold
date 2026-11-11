-- AlterTable
ALTER TABLE "Chore" ADD COLUMN     "xpOverride" INTEGER;

-- AlterTable
ALTER TABLE "Family" ADD COLUMN     "gamification" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "XpEntry" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "instanceId" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "XpEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberBadge" (
    "id" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "choreId" UUID,
    "awardedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberBadge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyGoal" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "targetXp" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "reachedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "FamilyGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "XpEntry_familyId_createdAt_idx" ON "XpEntry"("familyId", "createdAt");

-- CreateIndex
CREATE INDEX "XpEntry_membershipId_idx" ON "XpEntry"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "XpEntry_instanceId_membershipId_key" ON "XpEntry"("instanceId", "membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberBadge_membershipId_key_key" ON "MemberBadge"("membershipId", "key");

-- CreateIndex
CREATE INDEX "FamilyGoal_familyId_closedAt_idx" ON "FamilyGoal"("familyId", "closedAt");

-- AddForeignKey
ALTER TABLE "XpEntry" ADD CONSTRAINT "XpEntry_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XpEntry" ADD CONSTRAINT "XpEntry_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XpEntry" ADD CONSTRAINT "XpEntry_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "ChoreInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberBadge" ADD CONSTRAINT "MemberBadge_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyGoal" ADD CONSTRAINT "FamilyGoal_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
