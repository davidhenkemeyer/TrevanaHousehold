-- CreateTable
CREATE TABLE "PushTicket" (
    "id" UUID NOT NULL,
    "ticketId" TEXT NOT NULL,
    "expoPushToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushTicket_ticketId_key" ON "PushTicket"("ticketId");

-- CreateIndex
CREATE INDEX "PushTicket_createdAt_idx" ON "PushTicket"("createdAt");
