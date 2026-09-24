-- Add task completion metadata and a lightweight category without altering or
-- deleting existing task data.
ALTER TABLE "Task" ADD COLUMN "taskType" TEXT NOT NULL DEFAULT 'GENERAL';
ALTER TABLE "Task" ADD COLUMN "completedAt" TIMESTAMP(3);
CREATE INDEX "Task_userId_status_dueDate_idx" ON "Task"("userId", "status", "dueDate");
