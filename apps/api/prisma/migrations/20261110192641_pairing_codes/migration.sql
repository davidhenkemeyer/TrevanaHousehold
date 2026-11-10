-- CreateTable
CREATE TABLE "PairingCode" (
    "id" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PairingCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PairingCode_codeHash_key" ON "PairingCode"("codeHash");

-- CreateIndex
CREATE INDEX "PairingCode_membershipId_idx" ON "PairingCode"("membershipId");

-- AddForeignKey
ALTER TABLE "PairingCode" ADD CONSTRAINT "PairingCode_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PairingCode" ADD CONSTRAINT "PairingCode_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
