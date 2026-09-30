# Consulting Hub product specification

## Vision

Consulting Hub is a recruiting operating system for students and early-career candidates targeting consulting internships and full-time roles. It supports the process from firm targeting and networking through offers.

## Users and workflows

Each account owns its recruiting data. Core workflows are: target a firm, manage networking contacts and interaction history, turn follow-ups into tasks, track opportunities and applications, and use the dashboard to identify the next action.

## Core entities

User, Company (firm), Office, Contact, Interaction, Task, Opportunity, Application, Interview, and Document. Every private record is user-scoped at the database and API layers. Offices are user-owned target locations associated with firms.

## Current foundation

Accounts use password hashing and server-side sessions persisted in HTTP-only cookies. API routes derive the authenticated user server-side, never from a client-supplied user ID. New users complete a short recruiting profile before entering the workspace, and profile data persists across sessions. The dashboard and current recruiting-resource APIs scope queries and mutations to the authenticated account.

## Planned modules

Dashboard; Firms; Networking; Opportunities; Applications; Tasks; Interviews; Case Prep; Behavioral Story Bank; Documents; Recruiting Profile; later calendar, email, and job-import integrations.

## Milestones

1. Secure accounts and user-owned data.
2. Firms and target offices.
3. Networking CRM: contact enrichment, interaction history, and follow-up workflow.
4. Opportunity/application pipeline and document selection.
5. Actionable recruiting dashboard and tasks.
6. Interview tracking: scheduling, outcomes, preparation tasks, and application/firm context.
7. Preparation modules and integrations.

## UX principles

Opportunity cards and Today actions open the same dedicated opportunity page at `#/opportunities/:id`. The page displays owned networking, application/document, interview, and task context. External links use the application's existing `applicationPortalUrl`, then the opportunity's existing `jobUrl`, then the firm's optional `careersUrl`, then `website`. Only valid HTTP(S) links are offered. Quick Add preserves `jobUrl` and `rawPostingText`; no job-site scraping is performed. The detail integration suite is `npm run test:opportunity-detail` and uses an isolated temporary SQLite database.

Professional, calm, and efficient. Prefer useful empty states, clear forms, and actionable dashboards over decorative analytics. Preserve the existing dashboard visual language.

## Data and security

Authenticated identity is derived server-side; API clients never select a user ID. Every read and mutation is ownership-scoped. Credentials, session secrets, uploads, and databases are excluded from version control. Production migrations must be additive and never reset or seed production data automatically.

Interview timestamps store the intended instant in UTC together with an IANA timezone (normally the candidate's browser timezone). Clients submit ISO datetimes with an offset; the API rejects timezone-less local strings so server UTC cannot silently shift a recruiting date. Existing interview timestamps are never reinterpreted.
