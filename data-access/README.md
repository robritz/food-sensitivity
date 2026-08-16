# data-access

The Supabase-backed data-access layer for food-tracker. This is the single
module future feature tickets extend — new tables get a migration under
`../supabase/migrations/`, new queries get a function in `src/`.

## Layout

- `../supabase/` — Supabase CLI project (`supabase init`'d at the repo root).
  Schema lives in `../supabase/migrations/*.sql`.
- `src/client.ts` — `createDataAccessClient()` (RLS-enforced, what the app
  uses) and `createServiceRoleClient()` (bypasses RLS; server-side/tests
  only).
- `src/database.types.ts` — generated from the schema, regenerate after every
  migration (see below).
- `test/` — integration tests that run against a real Supabase instance.

## Local development

```sh
npm install
npm run supabase:start   # starts local Supabase in Docker
cp .env.test.example .env.test
npm test
npm run supabase:stop
```

`npm run supabase:start` prints the local URL and keys; they should already
match `.env.test.example` (Supabase's fixed local-dev defaults) unless you've
changed the project config.

## Changing the schema

1. Add a new file under `../supabase/migrations/` (see the existing one for
   the grant + RLS pattern every household-owned table needs).
2. `npm run supabase:reset` to reapply all migrations against the local
   database (works whether or not it's already running).
3. `npm run gen:types` to regenerate `src/database.types.ts`.
4. `npm test`.

## Hosted project

`scripts/provision-supabase.sh` is an interactive wizard that walks through
creating a hosted Supabase project, linking this repo to it, pushing the
schema, and capturing `SUPABASE_URL` / `SUPABASE_ANON_KEY` /
`SUPABASE_SERVICE_ROLE_KEY` into `.env`. Run it from anywhere:

```sh
./scripts/provision-supabase.sh
```
