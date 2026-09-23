-- Add firm metadata and user-owned target offices without modifying or removing existing data.
ALTER TABLE "Company" ADD COLUMN "firmType" TEXT;
ALTER TABLE "Company" ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE "Company" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "Company_userId_priority_idx" ON "Company"("userId", "priority");

CREATE TABLE "Office" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "region" TEXT,
  "country" TEXT,
  "targetStatus" TEXT NOT NULL DEFAULT 'TARGET',
  "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Office_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Office_companyId_city_region_country_key" ON "Office"("companyId", "city", "region", "country");
CREATE INDEX "Office_userId_priority_idx" ON "Office"("userId", "priority");
ALTER TABLE "Office" ADD CONSTRAINT "Office_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Office" ADD CONSTRAINT "Office_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
