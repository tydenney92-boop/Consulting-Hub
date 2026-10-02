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
npm run test:calendar    # verify planned networking, Calendar sync, and ownership
npm start                # serve the production build (Railway command)
```

## Railway deployment notes

Local development uses `prisma/schema.prisma` with SQLite. Railway production uses `prisma/schema.postgres.prisma` and a PostgreSQL `DATABASE_URL`; never run a production reset or seed production automatically. Configure Railway to build with `npx prisma generate --schema prisma/schema.postgres.prisma && npm run build`, run `npx prisma migrate deploy --schema prisma/schema.postgres.prisma` as its pre-deploy command, start with `npm start`, and health-check `/api/health`. Railway assigns `PORT`; do not set it manually unless overriding locally. If the service is not opted into Railway config-as-code, set those commands in the Railway service settings as well as keeping `railway.json` aligned.

Local document files are stored in `uploads/`. In Railway, attach the Consulting Hub service's persistent volume at `/data`; the production API stores private uploads at `/data/uploads` and serves them only through authenticated document-download endpoints. Keep `UPLOAD_DIR` unset in production unless it points inside that persistent volume. SQLite and local uploads remain development-only.

### Google Calendar setup

Google Calendar is optional and uses a server-side OAuth 2.0 web application. Consulting Hub requests only `https://www.googleapis.com/auth/calendar.events.owned`, creates or updates events on the user's primary calendar, and never imports calendar data.

1. In Google Cloud, enable the Google Calendar API and configure the OAuth consent screen.
2. Create an OAuth client with application type **Web application**.
3. Add `http://localhost:4000/api/google-calendar/callback` as a local authorized redirect URI.
4. Add `https://consulting-hub-production-603a.up.railway.app/api/google-calendar/callback` as the production authorized redirect URI. It must exactly match `GOOGLE_REDIRECT_URI`.
5. Set these server-only variables locally and in the Railway web service: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_TOKEN_ENCRYPTION_KEY`, and `APP_BASE_URL`. Generate the encryption key with `openssl rand -base64 32`. Set `APP_BASE_URL` to the public origin without a trailing slash.

Do not expose the client secret, encryption key, access tokens, or refresh tokens to Vite/client variables. Railway needs no Calendar-specific build or migration command; the existing `prisma migrate deploy --schema prisma/schema.postgres.prisma` pre-deploy workflow applies the additive schema safely. OAuth must be configured before the first live connection test.

### Opportunity discovery

**Search Opportunities** opens a review-first public-listing search. Results are normalized, deduplicated by company/title/location (while retaining every source URL), compared to the signed-in user's existing tracker, and added only after explicit selection. Added records default to `TARGET` and `MEDIUM` priority. Search runs retain their configuration, timestamp, and source failures.

Discovery uses the OpenAI Responses API web-search tool. Set server-only `OPENAI_API_KEY` in the app environment; `OPENAI_DISCOVERY_MODEL` is optional and defaults to `gpt-5.5`. Results are cached briefly, retried with a small backoff, and source failures are shown in the review screen. The search prompt permits only direct public listing pages: it never bypasses logins, CAPTCHAs, paywalls, robots rules, rate limits, or site terms, and never uses private APIs or credentialed browsing.

## API highlights

- `GET/POST /api/opportunities`, `PATCH/DELETE /api/opportunities/:id`
- `GET/POST /api/applications`, `PATCH /api/applications/:id/stage`
- `GET/POST /api/contacts`, `POST /api/interactions`, owned planned-interaction create/edit/complete/cancel/retry routes
- `GET /api/google-calendar/status`, OAuth connect/callback, preference, and disconnect routes
- `GET/POST/PATCH /api/tasks`
- `GET/POST /api/documents`, `GET/PATCH/DELETE /api/documents/:id`, `POST /api/documents/:id/default`, `GET /api/documents/:id/download`
- `GET /api/dashboard`, `/api/timeline`, `/api/analytics`, `/api/search`
- `GET /api/export/opportunities` and `/api/export/contacts`

## Notes

SQLite is the initial local database; the schema uses normalized IDs and relations so it can be migrated to PostgreSQL. Document metadata is private and user-scoped, while local files land in `uploads/`. The job-source providers are intentional placeholder interfaces for future official APIs, user-authorized browser imports, or CSV imports—this project does not scrape third-party sites or bypass access controls.
