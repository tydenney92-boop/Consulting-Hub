-- Add structured import metadata to opportunities without changing existing rows.
ALTER TABLE "Opportunity" ADD COLUMN "requisitionId" TEXT;
ALTER TABLE "Opportunity" ADD COLUMN "eligibility" TEXT;
ALTER TABLE "Opportunity" ADD COLUMN "deadlineType" TEXT NOT NULL DEFAULT 'UNKNOWN';

CREATE INDEX "Opportunity_userId_companyId_requisitionId_idx"
ON "Opportunity"("userId", "companyId", "requisitionId");

CREATE TABLE "OpportunityImport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileFingerprint" TEXT NOT NULL,
    "sheetName" TEXT NOT NULL,
    "headerRow" INTEGER NOT NULL,
    "headersJson" TEXT NOT NULL,
    "mappingJson" TEXT NOT NULL,
    "workbookJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREVIEW',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "committedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OpportunityImport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OpportunityImportRow" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "rowFingerprint" TEXT NOT NULL,
    "sourceJson" TEXT NOT NULL,
    "mappedJson" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "defaultDecision" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "matchedOpportunityId" TEXT,
    "error" TEXT,
    "committedOpportunityId" TEXT,
    "committedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OpportunityImportRow_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OpportunityImport_userId_status_expiresAt_idx"
ON "OpportunityImport"("userId", "status", "expiresAt");
CREATE UNIQUE INDEX "OpportunityImportRow_importId_rowNumber_key"
ON "OpportunityImportRow"("importId", "rowNumber");
CREATE INDEX "OpportunityImportRow_importId_decision_idx"
ON "OpportunityImportRow"("importId", "decision");

ALTER TABLE "OpportunityImport" ADD CONSTRAINT "OpportunityImport_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OpportunityImportRow" ADD CONSTRAINT "OpportunityImportRow_importId_fkey"
FOREIGN KEY ("importId") REFERENCES "OpportunityImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
