-- Nullable, additive field: existing applications retain all data and stages.
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "assessmentStatus" TEXT;
