-- Additive consulting pipeline fields; no existing recruiting records are removed or rewritten.
ALTER TABLE "Opportunity" ADD COLUMN "officeId" TEXT;
ALTER TABLE "Opportunity" ADD COLUMN "networkingContactId" TEXT;
ALTER TABLE "Opportunity" ADD COLUMN "recruitingSeason" TEXT;
ALTER TABLE "Opportunity" ADD COLUMN "referralStatus" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "Opportunity" ADD COLUMN "transcriptRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Opportunity" ADD COLUMN "assessmentRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Opportunity" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Application" ADD COLUMN "assessmentStatus" TEXT;
CREATE INDEX "Opportunity_userId_status_idx" ON "Opportunity"("userId", "status");
CREATE INDEX "Opportunity_officeId_idx" ON "Opportunity"("officeId");
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_networkingContactId_fkey" FOREIGN KEY ("networkingContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
