-- Additive interview-tracking metadata. Existing timestamps remain untouched;
-- their stored instants are preserved and timezone defaults describe new records.
ALTER TABLE "Interview" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'America/Denver';
ALTER TABLE "Interview" ADD COLUMN "interviewerContactId" TEXT;
ALTER TABLE "Interview" ADD COLUMN "preparationNotes" TEXT;
ALTER TABLE "Interview" ADD COLUMN "outcome" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Interview" ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "Interview" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Interview" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Interview"
  ADD CONSTRAINT "Interview_interviewerContactId_fkey"
  FOREIGN KEY ("interviewerContactId") REFERENCES "Contact"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Interview_userId_date_idx" ON "Interview"("userId", "date");
CREATE INDEX "Interview_applicationId_date_idx" ON "Interview"("applicationId", "date");
CREATE INDEX "Interview_userId_outcome_idx" ON "Interview"("userId", "outcome");
