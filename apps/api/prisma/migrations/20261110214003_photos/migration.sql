-- CreateEnum
CREATE TYPE "UploadPurpose" AS ENUM ('SUBMISSION', 'REFERENCE');

-- AlterTable
ALTER TABLE "Chore" ADD COLUMN     "referencePhotoKey" TEXT;

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "photosDeletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Upload" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "purpose" "UploadPurpose" NOT NULL,
    "key" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Upload_key_key" ON "Upload"("key");

-- CreateIndex
CREATE INDEX "Upload_familyId_idx" ON "Upload"("familyId");

-- CreateIndex
CREATE INDEX "Upload_expiresAt_idx" ON "Upload"("expiresAt");

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
