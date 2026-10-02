CREATE TABLE "OpportunitySearchRun" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "configuration" TEXT NOT NULL,
  "sourceFailures" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OpportunitySearchRun_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "OpportunitySearchResult" (
  "id" TEXT NOT NULL,
  "searchRunId" TEXT NOT NULL,
  "company" TEXT NOT NULL,
  "roleTitle" TEXT NOT NULL,
  "location" TEXT NOT NULL,
  "employmentType" TEXT,
  "internshipSeason" TEXT,
  "postingDate" TIMESTAMP(3),
  "deadline" TIMESTAMP(3),
  "source" TEXT NOT NULL,
  "sourceUrls" TEXT NOT NULL,
  "descriptionSnippet" TEXT,
  "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "matchStatus" TEXT NOT NULL DEFAULT 'NEW',
  "existingOpportunityId" TEXT,
  CONSTRAINT "OpportunitySearchResult_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OpportunitySearchRun_userId_createdAt_idx" ON "OpportunitySearchRun"("userId", "createdAt");
CREATE INDEX "OpportunitySearchResult_searchRunId_matchStatus_idx" ON "OpportunitySearchResult"("searchRunId", "matchStatus");
ALTER TABLE "OpportunitySearchRun" ADD CONSTRAINT "OpportunitySearchRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OpportunitySearchResult" ADD CONSTRAINT "OpportunitySearchResult_searchRunId_fkey" FOREIGN KEY ("searchRunId") REFERENCES "OpportunitySearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
