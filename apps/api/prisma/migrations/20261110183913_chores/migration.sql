-- CreateEnum
CREATE TYPE "ChoreStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'DEFERRED', 'PENDING_REVIEW', 'APPROVED', 'NEEDS_REWORK', 'REJECTED', 'CANCELED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'NORMAL', 'HIGH');

-- CreateEnum
CREATE TYPE "AssignMode" AS ENUM ('FIXED', 'ROTATE', 'AUTO');

-- CreateEnum
CREATE TYPE "ReviewPolicy" AS ENUM ('REVIEW_EACH', 'BATCH_OK', 'AUTO_APPROVE');

-- CreateEnum
CREATE TYPE "ReviewAction" AS ENUM ('APPROVE', 'REQUEST_REWORK', 'REJECT');

-- CreateTable
CREATE TABLE "Chore" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "effortMinutes" INTEGER NOT NULL,
    "defaultPriority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "requiresPhoto" BOOLEAN NOT NULL DEFAULT false,
    "reviewPolicy" "ReviewPolicy" NOT NULL DEFAULT 'REVIEW_EACH',
    "rewardAmount" INTEGER NOT NULL DEFAULT 0,
    "recurrence" JSONB NOT NULL,
    "deadlineMinutes" INTEGER NOT NULL,
    "assignMode" "AssignMode" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChoreChecklistItem" (
    "id" UUID NOT NULL,
    "choreId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "ChoreChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChoreEligible" (
    "choreId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "ChoreEligible_pkey" PRIMARY KEY ("choreId","membershipId")
);

-- CreateTable
CREATE TABLE "ChoreInstance" (
    "id" UUID NOT NULL,
    "choreId" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "occurrenceDate" DATE NOT NULL,
    "availableAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "ChoreStatus" NOT NULL DEFAULT 'NEW',
    "isLate" BOOLEAN NOT NULL DEFAULT false,
    "priority" "Priority" NOT NULL,
    "rewardAmount" INTEGER NOT NULL,
    "effortMinutes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChoreInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstanceAssignee" (
    "instanceId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,

    CONSTRAINT "InstanceAssignee_pkey" PRIMARY KEY ("instanceId","membershipId")
);

-- CreateTable
CREATE TABLE "InstanceEvent" (
    "id" UUID NOT NULL,
    "instanceId" UUID NOT NULL,
    "actorMembershipId" UUID,
    "action" TEXT NOT NULL,
    "fromStatus" "ChoreStatus" NOT NULL,
    "toStatus" "ChoreStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstanceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" UUID NOT NULL,
    "instanceId" UUID NOT NULL,
    "submittedById" UUID NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "checklistState" JSONB NOT NULL,
    "photoKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" UUID NOT NULL,
    "submissionId" UUID NOT NULL,
    "reviewerId" UUID,
    "action" "ReviewAction" NOT NULL,
    "note" TEXT,
    "annotations" JSONB,
    "batch" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Chore_familyId_active_idx" ON "Chore"("familyId", "active");

-- CreateIndex
CREATE INDEX "ChoreChecklistItem_choreId_idx" ON "ChoreChecklistItem"("choreId");

-- CreateIndex
CREATE INDEX "ChoreInstance_familyId_occurrenceDate_idx" ON "ChoreInstance"("familyId", "occurrenceDate");

-- CreateIndex
CREATE INDEX "ChoreInstance_familyId_status_idx" ON "ChoreInstance"("familyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ChoreInstance_choreId_occurrenceDate_key" ON "ChoreInstance"("choreId", "occurrenceDate");

-- CreateIndex
CREATE INDEX "InstanceAssignee_membershipId_idx" ON "InstanceAssignee"("membershipId");

-- CreateIndex
CREATE INDEX "InstanceEvent_instanceId_idx" ON "InstanceEvent"("instanceId");

-- CreateIndex
CREATE INDEX "Submission_instanceId_idx" ON "Submission"("instanceId");

-- CreateIndex
CREATE INDEX "Review_submissionId_idx" ON "Review"("submissionId");

-- AddForeignKey
ALTER TABLE "Chore" ADD CONSTRAINT "Chore_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chore" ADD CONSTRAINT "Chore_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreChecklistItem" ADD CONSTRAINT "ChoreChecklistItem_choreId_fkey" FOREIGN KEY ("choreId") REFERENCES "Chore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreEligible" ADD CONSTRAINT "ChoreEligible_choreId_fkey" FOREIGN KEY ("choreId") REFERENCES "Chore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreEligible" ADD CONSTRAINT "ChoreEligible_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreInstance" ADD CONSTRAINT "ChoreInstance_choreId_fkey" FOREIGN KEY ("choreId") REFERENCES "Chore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreInstance" ADD CONSTRAINT "ChoreInstance_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstanceAssignee" ADD CONSTRAINT "InstanceAssignee_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "ChoreInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstanceAssignee" ADD CONSTRAINT "InstanceAssignee_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstanceEvent" ADD CONSTRAINT "InstanceEvent_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "ChoreInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstanceEvent" ADD CONSTRAINT "InstanceEvent_actorMembershipId_fkey" FOREIGN KEY ("actorMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "ChoreInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
