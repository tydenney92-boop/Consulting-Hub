# Consulting Recruiting Hub architecture

## Structure

- `client/` — Vite + React + TypeScript interface.
- `server/` — Express REST API, upload endpoint, job source abstraction, and workflow check.
- `prisma/` — normalized Prisma schema and realistic seed data.
- `uploads/` — local document storage for the initial release.

## Data model

`Company` is the CRM anchor. It has many `Opportunity` and `Contact` records. An `Application` belongs to an opportunity and can reference documents and contacts. `Interaction`, `Interview`, `Task`, `Document`, and `Activity` record the relationship history. Optional relation fields on a task let a task be attached to the most useful record without polymorphic tables.

## API

REST endpoints use plural resources (`/api/opportunities`, `/api/applications`, `/api/contacts`, `/api/tasks`, `/api/documents`). Dashboard, analytics, search, and timeline each provide a purpose-built read endpoint. Mutations create activity records. File bytes are stored locally while document metadata remains in SQLite.

## Implementation plan

1. Prisma schema + seed data
2. Express API and upload handler
3. Shared React shell and fast-add modal
4. Dashboard, opportunity catalogue, Kanban, networking, calendar, documents, tasks, analytics
5. Workflow validation and responsive polish

## Integration boundary

`server/src/job-sources.ts` exposes `JobSourceProvider`. `ManualProvider` is functional; LinkedIn, Indeed, Handshake, and company-career providers are explicit non-scraping placeholders for future official APIs, CSV imports, or browser-assisted user-authorized imports.
