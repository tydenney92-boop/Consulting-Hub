# Consulting Hub agent notes

Read `PRODUCT_SPEC.md` before product work. This is a React/Vite client, Express API, and Prisma application. Use `npm run dev`, `npm run build`, `npm run db:generate`, `npm run test:auth`, and `npm run test:workflows` where applicable.

Authentication uses password hashes and server-side sessions stored in HTTP-only cookies. Keep private recruiting data ownership-scoped in database queries and API handlers; never trust a client-supplied user ID. Protected routes must derive identity from the authenticated session, and changes to auth or ownership behavior require `npm run test:auth`.

Preserve existing data and use additive, production-safe Prisma migrations. The local default schema is SQLite; Railway uses `prisma/schema.postgres.prisma` and a PostgreSQL `DATABASE_URL`.

Do not commit `.env`, databases, uploads, or secrets. Demo seed data requires `ALLOW_DEMO_SEED=true` and is blocked in production. Do not reset production data, seed production automatically, or change Railway configuration without a deployment-specific reason. Verify the production build and relevant workflows before asking the user to commit or deploy.
