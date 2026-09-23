# Consulting Hub product specification

## Vision

Consulting Hub is a recruiting operating system for students and early-career candidates targeting consulting internships and full-time roles. It supports the process from firm targeting and networking through offers.

## Users and workflows

Each account owns its recruiting data. Core workflows are: target a firm, manage networking contacts and interaction history, turn follow-ups into tasks, track opportunities and applications, and use the dashboard to identify the next action.

## Core entities

User, Company (firm), Contact, Interaction, Task, Opportunity, Application, Interview, and Document. Every private record is user-scoped at the database and API layers. Office support is planned; it is not yet a standalone model.

## Current foundation

Accounts use password hashing and server-side sessions persisted in HTTP-only cookies. API routes derive the authenticated user server-side, never from a client-supplied user ID. New users complete a short recruiting profile before entering the workspace, and profile data persists across sessions. The dashboard and current recruiting-resource APIs scope queries and mutations to the authenticated account.

## Planned modules

Dashboard; Firms; Networking; Opportunities; Applications; Tasks; Interviews; Case Prep; Behavioral Story Bank; Documents; Recruiting Profile; later calendar, email, and job-import integrations.

## Milestones

1. Secure accounts, user-owned data, Companies, Networking, Interactions, follow-up Tasks, and a live dashboard; add office support as the firm model expands.
2. Complete opportunity/application and interview workflows.
3. Preparation modules and integrations.

## UX principles

Professional, calm, and efficient. Prefer useful empty states, clear forms, and actionable dashboards over decorative analytics. Preserve the existing dashboard visual language.

## Data and security

Authenticated identity is derived server-side; API clients never select a user ID. Every read and mutation is ownership-scoped. Credentials, session secrets, uploads, and databases are excluded from version control. Production migrations must be additive and never reset or seed production data automatically.
