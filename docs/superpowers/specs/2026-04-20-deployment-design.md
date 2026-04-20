# Deployment Design

**Goal:** Deploy Bookshelf to `bookself.iterosys.com` on the free tier with automatic CI/CD — migrations run on every deploy, PRs get a quality gate before merge.

**Architecture:** Vercel Hobby (hosting + preview deployments) connected to the existing GitHub repo. `drizzle-kit migrate` runs as part of the Vercel build command so schema changes apply automatically. A GitHub Actions workflow runs typecheck, lint, and tests on every pull request.

**Services used (all free tier):**
- Vercel Hobby — hosting, TLS, preview deployments
- Supabase — PostgreSQL (already in use)
- Resend — transactional email (already in use)
- GitHub Actions — PR quality gate

---

## Hosting & Custom Domain

- Vercel project linked to the GitHub repo via Vercel's GitHub integration
- Production deploys trigger on every push to `main`
- Pull requests automatically get preview deployment URLs from Vercel
- Custom domain `bookself.iterosys.com` added in Vercel dashboard
- DNS: add a `CNAME` record at the DNS provider for `bookself` → `cname.vercel-dns.com`
- Vercel auto-provisions a TLS certificate via Let's Encrypt
- `NEXT_PUBLIC_SITE_URL=https://bookself.iterosys.com` set in Vercel env vars so Server Actions CSRF checks pass

---

## Build Command & Migrations

Vercel build command (overrides default `next build`):

```
npm run db:migrate && npm run build
```

- `db:migrate` runs `drizzle-kit migrate`, which uses the `__drizzle_migrations` tracking table — idempotent, only applies unapplied migrations
- Uses `DIRECT_URL` (Supabase direct connection, not pooled) for the migration connection
- If a migration fails, the Vercel build fails and the current production deployment stays live — no partial deploys

### Environment variables (set in Vercel dashboard, Production environment)

| Variable | Description |
|---|---|
| `DATABASE_URL` | Supabase pooled URL (Transaction mode, port 6543) |
| `DIRECT_URL` | Supabase direct URL (port 5432) — used by migrations |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key |
| `RESEND_API_KEY` | Resend API key for transactional email |
| `EMAIL_FROM` | Sender address (e.g. `noreply@mail.iterosys.com`) |
| `NEXT_PUBLIC_SITE_URL` | `https://bookself.iterosys.com` |

`ADDITIONAL_ALLOWED_ORIGINS` is optional — add it if Vercel preview URLs need to call Server Actions (useful during development).

---

## GitHub Actions CI

File: `.github/workflows/ci.yml`

Triggers on pull requests targeting `main`. Steps:

1. Checkout code
2. Set up Node 20
3. `npm ci`
4. `npm run typecheck`
5. `npm run lint`
6. `npm test`

No database or secrets required — unit tests mock `fetch` via `vi.stubGlobal` and run fully offline. The workflow is a quality gate only; Vercel handles all deployments natively.

---

## Deployment Flow Summary

```
PR opened
  └─ GitHub Actions: typecheck + lint + test (must pass to merge)
  └─ Vercel: preview deployment (automatic)

Push to main
  └─ Vercel build: npm run db:migrate && npm run build
  └─ If build passes: deploy to bookself.iterosys.com
  └─ If build fails: current production stays live
```
