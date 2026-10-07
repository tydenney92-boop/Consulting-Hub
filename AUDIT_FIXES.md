# Recruiting workflow and navigation fixes

This patch is a targeted remediation of the current-repository audit, not a claim that every UI concern or planned product feature is complete.

## Implemented

- Shared record URLs and real links for firms, contacts, opportunities, applications, interviews, tasks and documents; refresh-safe details and contextual Back navigation.
- Reused application and interview workspaces instead of incompatible generic detail forms. Canonical stage values, including closed applications.
- Quick Add tasks use the task API; failures are visible. Task descriptions can expose URLs, completion controls are named, and editing notes preserves an existing due-time instant.
- Interview edits preserve the saved timezone and repeated-DST-hour instant. Archived interviews have a recovery view.
- Document details expose owned application references and editable metadata. Transcript references block deletion just like resumes and cover letters.
- Actionable timeline entries, history visibility, saved interview timezone display, related-record links and contextual task/interview creation.
- Editable firm/office profiles and safe external firm links; empty firm lists render without crashing.
- Dashboard applied-action suppression and effective pipeline counts; partial data-load failures no longer sign out a valid session.
- Removed duplicate API route handlers and the main client's TypeScript suppression.
- Owned demo seed records, guarded development-only seeding, and documentation corrected to avoid advertising an unimplemented discovery flow.
- Ownership-scoped CSV export with formula-injection protection; mobile Today cards wrap within their container.

## Verification

Production client/server builds; workflows, auth (including production cookies), interviews, applied transition, opportunity deletion, Today navigation, opportunity workspace, Quick Add, networking, opportunity detail, Calendar and audit regression suites.

Browser smoke checks use a local disposable demo database, never production recruiting data. Cross-record navigation, refresh, Back to the originating firm, and Quick Add task creation were exercised.

## Remaining considerations

- List-filter and scroll restoration is not guaranteed across every asynchronous view or a new browser session.
- Some older dialogs still need a full keyboard focus-trap/accessibility pass.
- Contact creation from inline dialogs can still remain on the surrounding workspace rather than opening its own URL immediately.
- Discovery remains unimplemented; this patch documents that limitation instead of adding a new paid integration.
- Production PostgreSQL runtime and Railway deployment require their own post-deployment smoke test. No production schema changes are included.

No GitHub push, Railway deployment, production data migration, or production seed is part of this commit.
