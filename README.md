# Consulting Recruiting Hub

A personal recruiting CRM for consulting internships: opportunities, applications, contacts, interviews, documents, tasks, deadlines, and conversion analytics.

## Run locally

```bash
npm install
cp .env.example .env
npx prisma generate
# First-time database setup (works around a local Prisma schema-engine issue):
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script | sqlite3 prisma/dev.db
ALLOW_DEMO_SEED=true npm run db:seed
npm run dev
```

Open `http://localhost:5173`.

## Common commands

```bash
npm run dev              # React and Express together
npm run build            # production typecheck/build
ALLOW_DEMO_SEED=true npm run db:seed  # reset to the realistic demo data (development only)
npm run test:workflows   # verify core seed fixtures
npm start                # serve the production build (Railway command)
```

## Railway deployment notes

Local development uses `prisma/schema.prisma` with SQLite. Railway production uses `prisma/schema.postgres.prisma` and a PostgreSQL `DATABASE_URL`; never run a production reset or seed production automatically. Configure Railway to build with `npx prisma generate --schema prisma/schema.postgres.prisma && npm run build`, run `npx prisma migrate deploy --schema prisma/schema.postgres.prisma` as its pre-deploy command, start with `npm start`, and health-check `/api/health`. Railway assigns `PORT`; do not set it manually unless overriding locally. If the service is not opted into Railway config-as-code, set those commands in the Railway service settings as well as keeping `railway.json` aligned.

`uploads/` and the SQLite database are local filesystem storage and are not durable across Railway deployments or restarts. Use PostgreSQL for data and object storage (such as S3/R2) for uploaded documents before treating the deployment as production-ready.

## API highlights

- `GET/POST /api/opportunities`, `PATCH/DELETE /api/opportunities/:id`
- `GET/POST /api/applications`, `PATCH /api/applications/:id/stage`
- `GET/POST /api/contacts`, `POST /api/interactions`
- `GET/POST/PATCH /api/tasks`, `GET/POST /api/documents`
- `GET /api/dashboard`, `/api/timeline`, `/api/analytics`, `/api/search`
- `GET /api/export/opportunities` and `/api/export/contacts`

## Notes

SQLite is the initial local database; the schema uses normalized IDs and relations so it can be migrated to PostgreSQL. Uploaded document metadata is in SQLite and files land in `uploads/`. The job-source providers are intentional placeholder interfaces for future official APIs, user-authorized browser imports, or CSV imports—this project does not scrape third-party sites or bypass access controls.
