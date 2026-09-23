# Functional test results — 2026-09-22

The following sequence was executed against the running local Express API with SQLite persistence:

| Test | Result | Evidence |
|---|---|---|
| Create Test Consulting Firm | Pass | Company record created with persistent ID. |
| Create Summer Consulting Intern opportunity | Pass | Linked to test company; deadline and priority persisted. |
| Create application | Pass | `POST /opportunities/:id/application` created a linked application. |
| Upload and attach resume | Pass | Local file upload saved document metadata/path; application retained its document ID. |
| Mark submitted | Pass | Stage changed to `APPLIED`, status to `Submitted`, and submission timestamp persisted. |
| Add contact | Pass | Linked Test Contact to Test Consulting Firm. |
| Log coffee chat | Pass | Interaction stored; follow-up date written back to contact. |
| Create follow-up task | Pass | Task linked to Test Contact and persisted. |
| Schedule interview | Pass | First Round Case interview linked to application and available in the timeline query. |
| Move application to First Round | Pass | Stage mutation persisted and returned its prep suggestion. |
| Search/dashboard data | Pass | Existing API reads from the SQLite database; records appear in relational dashboard, timeline, and search queries. |
| Build/typecheck | Pass | `npm run build` succeeds. |

## Notes

The temporary test records are intentionally retained so the user can see the workflow and remove them using the new API/UI actions. A browser refresh and server restart use the same SQLite file (`prisma/dev.db`), so these records persist.

## Remaining manual UI checks

The user-interface passes still need dedicated detail/editor surfaces for every record type. The REST operations are implemented and tested, but the current interface does not yet expose all new API actions (especially company, contact, application, interview, and document detail editing).
