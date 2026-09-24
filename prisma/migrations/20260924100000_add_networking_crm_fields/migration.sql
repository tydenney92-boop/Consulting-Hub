-- Additive networking CRM fields. Existing contacts and interactions remain intact.
ALTER TABLE "Contact" ADD COLUMN "officeId" TEXT;
ALTER TABLE "Contact" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'OTHER';
ALTER TABLE "Contact" ADD COLUMN "networkingStage" TEXT NOT NULL DEFAULT 'IDENTIFIED';
ALTER TABLE "Contact" ADD COLUMN "referralStatus" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "Contact" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Interaction" ADD COLUMN "followUpTaskId" TEXT;
CREATE INDEX "Interaction_followUpTaskId_idx" ON "Interaction"("followUpTaskId");
CREATE INDEX "Contact_userId_nextFollowUpDate_idx" ON "Contact"("userId", "nextFollowUpDate");
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE SET NULL ON UPDATE CASCADE;
