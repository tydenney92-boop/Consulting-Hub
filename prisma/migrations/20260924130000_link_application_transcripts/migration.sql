-- Add an optional reference to an existing user-owned transcript. No document data
-- is copied, and existing applications remain unchanged.
ALTER TABLE "Application" ADD COLUMN "transcriptId" TEXT;
CREATE INDEX "Application_transcriptId_idx" ON "Application"("transcriptId");
ALTER TABLE "Application" ADD CONSTRAINT "Application_transcriptId_fkey"
FOREIGN KEY ("transcriptId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
