-- Add a distinct lifecycle for planned networking, plus per-user Google Calendar OAuth storage.
CREATE TABLE "PlannedInteraction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Denver',
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "notes" TEXT,
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "addToCalendar" BOOLEAN NOT NULL DEFAULT false,
    "calendarEventId" TEXT,
    "calendarSyncStatus" TEXT NOT NULL DEFAULT 'NOT_REQUESTED',
    "calendarSyncError" TEXT,
    "completedInteractionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlannedInteraction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GoogleCalendarConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT,
    "accessTokenEncrypted" TEXT,
    "refreshTokenEncrypted" TEXT NOT NULL,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "autoAddPlannedInteractions" BOOLEAN NOT NULL DEFAULT false,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GoogleCalendarConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GoogleOAuthState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoogleOAuthState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlannedInteraction_completedInteractionId_key" ON "PlannedInteraction"("completedInteractionId");
CREATE INDEX "PlannedInteraction_userId_status_scheduledAt_idx" ON "PlannedInteraction"("userId", "status", "scheduledAt");
CREATE INDEX "PlannedInteraction_contactId_status_scheduledAt_idx" ON "PlannedInteraction"("contactId", "status", "scheduledAt");
CREATE UNIQUE INDEX "GoogleCalendarConnection_userId_key" ON "GoogleCalendarConnection"("userId");
CREATE UNIQUE INDEX "GoogleOAuthState_stateHash_key" ON "GoogleOAuthState"("stateHash");
CREATE INDEX "GoogleOAuthState_userId_expiresAt_idx" ON "GoogleOAuthState"("userId", "expiresAt");

ALTER TABLE "PlannedInteraction" ADD CONSTRAINT "PlannedInteraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlannedInteraction" ADD CONSTRAINT "PlannedInteraction_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlannedInteraction" ADD CONSTRAINT "PlannedInteraction_completedInteractionId_fkey" FOREIGN KEY ("completedInteractionId") REFERENCES "Interaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GoogleCalendarConnection" ADD CONSTRAINT "GoogleCalendarConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoogleOAuthState" ADD CONSTRAINT "GoogleOAuthState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
