# Functionality audit (pre-remediation)

| Area | Previous classification | Findings |
|---|---|---|
| Dashboard | Partially functional | Read from real records, but lacked overdue-task metric and empty/error handling. |
| Opportunities | Partially functional | Create, search and client-side filters worked; no edit, detail, archive, or create-application control. |
| Applications | Partially functional | Database-backed board and stage move worked; no editing, submit action, delete/archive, or document linking UI. |
| Networking | Partially functional | Read and contact creation worked; no edit/delete/detail or interaction form with a contact picker. |
| Company CRM | Not implemented | No company detail route or relational aggregation endpoint. |
| Documents | Partially functional | Upload and default resume worked; rename/delete/download actions were absent. |
| Tasks | Partially functional | Create and complete worked; no edit/reopen/delete or due-state summary. |
| Interviews | Partially functional | Seeded interviews appeared in dashboard/timeline; no create/edit/delete UI/API. |
| Timeline | Fully functional read | Derived from database records; items were not actionable. |
| Analytics | Partially functional | Derived calculations existed, but sparse-data state and requested breakdowns were absent. |
| Search | Fully functional read | Calls backend, but results were not navigable. |
| Settings | Not implemented | Placeholder screen. |
| Activity | Partially functional | Mutation activities were stored for some operations, not all. |

This remediation keeps the existing working-surface design and replaces remaining demo-only controls with persisted APIs, confirmations, and feedback. Seed data remains strictly optional development data.
