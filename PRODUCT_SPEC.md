# Consulting Hub product specification

## Vision

Consulting Hub is a recruiting operating system for students and early-career candidates targeting consulting internships and full-time roles. It supports the process from firm targeting and networking through offers.

## Users and workflows

Each account owns its recruiting data. Core workflows are: target a firm, manage networking contacts and interaction history, turn follow-ups into tasks, track opportunities and applications, and use the dashboard to identify the next action.

## Core entities

User, Company (firm), Office, Contact, Interaction, PlannedInteraction, Task, Opportunity, Application, Interview, and Document. Every private record is user-scoped at the database and API layers. Offices are user-owned target locations associated with firms.

## Current foundation

Accounts use password hashing and server-side sessions persisted in HTTP-only cookies. API routes derive the authenticated user server-side, never from a client-supplied user ID. New users complete a short recruiting profile before entering the workspace, and profile data persists across sessions. The dashboard and current recruiting-resource APIs scope queries and mutations to the authenticated account.

Unauthenticated visitors first see a public, read-only product overview at the root route. Its detailed workspace preview uses static fictional firms, contacts, roles, and activity only; it does not create a demo account, query protected recruiting endpoints, or expose persisted user data. Login and registration remain available at `#/login` and `#/register`.

## Planned modules

Dashboard; Firms; Networking; Opportunities; Applications; Tasks; Interviews; Case Prep; Behavioral Story Bank; Documents; Recruiting Profile; later email and job-import integrations.

## Milestones

1. Secure accounts and user-owned data.
2. Firms and target offices.
3. Networking CRM: contact enrichment, interaction history, and follow-up workflow.
4. Opportunity/application pipeline and document selection.
5. Actionable recruiting dashboard and tasks.
6. Interview tracking: scheduling, outcomes, preparation tasks, and application/firm context.
7. Preparation modules and integrations.

## UX principles

Networking uses a shared lightweight contact/profile and interaction flow, including the global quick-add toolbar. Only a contact name is required; existing first/last-name storage is retained (a single name uses an empty last name). Firm and title are optional; advanced contact details stay available through progressive disclosure. Interaction entry requires a type and date in the UI, with today's date preselected; notes and follow-up are optional. Existing API clients may omit the date to use now. Summaries remain supported for legacy records, but are no longer required. Owned interactions can be edited from contact history without changing their contact or owner. Interaction date edits recalculate Last Contacted from the complete owned history. Follow-up edits reuse, update, or remove the pending generated networking task without creating duplicates; completing/reopening that task synchronizes the contact reminder. Contact history and tasks are ownership-scoped. `npm run test:networking` exercises these flows in an isolated temporary database.

Planned networking interactions are separate from completed interaction history and follow-up tasks. A plan stores its contact, type, instant, IANA timezone, duration, notes, and location. Completing it creates exactly one logged interaction and can create or update the contact's single pending follow-up task. Google Calendar is an optional, one-way convenience integration: users connect it explicitly in Settings, event access is limited to calendars they own, and the default auto-add preference is off. Calendar failures never block Consulting Hub saves. OAuth credentials and encrypted tokens remain server-side, and deterministic event IDs make retries idempotent. Consulting Hub does not read or import calendar events.

Opportunity cards and Today actions open the same dedicated opportunity page at `#/opportunities/:id`. The page displays owned networking, application/document, interview, and task context. External links use the application's existing `applicationPortalUrl`, then the opportunity's existing `jobUrl`, then the firm's optional `careersUrl`, then `website`. Only valid HTTP(S) links are offered. Quick Add preserves `jobUrl` and `rawPostingText`; no job-site scraping is performed. The detail integration suite is `npm run test:opportunity-detail` and uses an isolated temporary SQLite database.

Professional, calm, and efficient. Prefer useful empty states, clear forms, and actionable dashboards over decorative analytics. Preserve the existing dashboard visual language.

## Data and security

Opportunity expiration is derived from its date-only application deadline being earlier than today, never stored or automatically archived. The Opportunities workspace defaults to Open (not archived and not expired); Expired excludes archived records, Archived is explicit, and All includes both. Passed deadlines and expired Ready-to-Apply prospecting actions no longer appear on the dashboard. Application stages, assessments, interviews, tasks, networking, documents, and direct detail access remain independent of expiration. Dashboard expiration uses the browser's validated IANA timezone, falling back to the configured recruiting timezone (America/Denver by default) for API clients. Existing task/interview timing is unchanged. Browser deadline presentation uses local calendar dates, not UTC-to-local conversion of midnight deadline timestamps. Expiration/lifecycle checks run within the isolated opportunity-detail suite.

Authenticated identity is derived server-side; API clients never select a user ID. Every read and mutation is ownership-scoped. Credentials, session secrets, uploads, and databases are excluded from version control. Production migrations must be additive and never reset or seed production data automatically.

Interview timestamps store the intended instant in UTC together with an IANA timezone (normally the candidate's browser timezone). Clients submit ISO datetimes with an offset; the API rejects timezone-less local strings so server UTC cannot silently shift a recruiting date. Existing interview timestamps are never reinterpreted.
