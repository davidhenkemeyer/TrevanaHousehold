-- CreateEnum
CREATE TYPE "AgeGroup" AS ENUM ('LITTLE', 'KID', 'TWEEN', 'TEEN');

-- AlterTable
ALTER TABLE "Chore" ADD COLUMN     "templateId" TEXT;

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "ageGroup" "AgeGroup";

-- CreateIndex
CREATE INDEX "Chore_familyId_templateId_idx" ON "Chore"("familyId", "templateId");

