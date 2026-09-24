-- Add private-storage metadata without changing or deleting existing documents.
ALTER TABLE "Document" ADD COLUMN "storageKey" TEXT;
ALTER TABLE "Document" ADD COLUMN "mimeType" TEXT;
ALTER TABLE "Document" ADD COLUMN "sizeBytes" INTEGER;
ALTER TABLE "Document" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "Document_storageKey_key" ON "Document"("storageKey");
CREATE INDEX "Document_userId_type_idx" ON "Document"("userId", "type");

-- PostgreSQL permits multiple NULL values in this partial unique index. It prevents
-- concurrent requests from producing two default resumes for the same account.
CREATE UNIQUE INDEX "Document_default_resume_per_user_key"
ON "Document"("userId")
WHERE "isDefault" = true AND "type" = 'RESUME';
