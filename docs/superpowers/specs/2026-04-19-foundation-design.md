# Spec 1.1 — Foundation

| | |
| --- | --- |
| **Date** | 2026-04-19 |
| **Project** | Bookshelf |
| **Spec** | 1.1 — Foundation (auth, schema, RLS, session) |
| **Phase** | Phase 1, first of three specs (1.1 Foundation → 1.2 Library + catalog → 1.3 ISBN + discovery) |
| **Status** | Draft — pending user review |

## 1. Context & scope expansions from the original plan

The baseline is `docs_local/plan.md`. Design discussion materially expanded scope in these areas:

1. **Multi-user (was a non-goal)** — the plan called out single-user as the v1 model. Now: Supabase Auth + unified "library" ownership model supporting both personal silos and co-owned shared libraries.
2. **Invite flow** — token-based invites via email, replacing the earlier "direct add / no invite" idea. Invite UI deferred to 1.2; tables and SECURITY DEFINER functions land in 1.1.
3. **Resend brought forward** — the plan deferred Resend to Phase 3. Here, Resend is configured as Supabase Auth's SMTP provider starting in 1.1 for confirmation / reset emails.
4. **Password gate dropped** — the `APP_PASSWORD` + cookie approach is replaced entirely by Supabase Auth (email/password + Google OAuth).

The non-goals from the plan that still hold: no digital reading, no reading progress/ratings, no native apps, no barcode scanning, no phone OTP in v1, no SMS invites in v1.

## 2. Goals

- A user can sign up (email+password or Google OAuth), confirm their email, log in, and land on a gated home page that reads data through a user-scoped DB session.
- On first auth, a personal library and owner membership are created atomically via DB trigger. No app-level code path required.
- The full data model (8 tables) is migrated, including the `library_invites` infrastructure, even though invite UI ships in 1.2.
- RLS is enabled and `FORCE`d on every table. A security smoke test proves isolation.
- Password reset flow works end-to-end.
- Security headers, CSP, and env validation are in place. Secrets never reach the client.

## 3. In scope vs out of scope

**In scope for 1.1:**
- Next.js 16 scaffold corrections (`proxy.ts`, async Request APIs, `images.remotePatterns`).
- Tailwind v4 + shadcn/ui baseline (button, input, label, form, card, toast).
- Drizzle + `postgres-js` + Supabase wiring; pooled URL for runtime, direct URL for migrations.
- Full DB schema: `profiles`, `libraries`, `library_members`, `library_invites`, `borrowers`, `currencies`, `books`, `loans`.
- Currencies seed: `BDT`, `USD`.
- Supabase Auth configured with email+password + Google OAuth.
- Resend configured as Supabase's SMTP provider (dashboard setting).
- Auth pages: `/login`, `/signup`, `/forgot-password`, `/reset-password`.
- `/auth/callback` route handler (OAuth, email confirmation, password reset all converge here).
- Trigger on `auth.users` INSERT: creates profile + personal library + owner membership atomically.
- RLS policies on every table, via two `SECURITY DEFINER` helpers.
- Four `SECURITY DEFINER` functions for complex ops: `fn_send_invite`, `fn_accept_invite`, `fn_revoke_invite`, `fn_transfer_ownership`.
- Logout Server Action.
- `proxy.ts` session gate with redirect rules.
- Zod-validated `lib/env.ts`.
- Minimal gated home page: "Hello <display_name>, you're in <library_name>".
- Security headers in `next.config.ts`.
- `sanitizeNext` unit test (Vitest).
- `scripts/smoke-rls.ts` security smoke test.
- `lib/env.ts` missing-var throw test.

**Out of scope (deferred to 1.2 or later):**
- Library switcher UI.
- Create-additional-library UI.
- Member management UI (list members, remove, transfer ownership).
- Invite UI (send, accept, list pending, revoke).
- Book / loan / borrower CRUD.
- ISBN lookup, search, filter.
- Phone OTP auth, SMS invites.
- Resend package inside the app (Supabase handles all 1.1 emails via Resend SMTP).
- Admin (service-role) Supabase client inside `app/` (only used by `scripts/` in 1.1).
- Resend custom email templates (use Supabase defaults in 1.1; polish in 1.2).
- Tests beyond the three exceptions above.

## 4. Architecture

### 4.1 Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Framework | Next.js 16.2.4, App Router | Turbopack default; Node runtime for proxy |
| React | 19.2 | Per Next 16 requirements |
| UI | Tailwind v4 + shadcn/ui | Manual `components/ui/` install; no shadcn CLI state persisted |
| DB | Supabase Postgres | Pooled URL for runtime, direct URL for migrations |
| ORM | Drizzle + `postgres-js` | `prepare: false` for pooler (Transaction mode) |
| Validation | Zod | Shared schemas in `lib/actions/auth.ts` used by both forms and actions |
| Auth | Supabase Auth via `@supabase/ssr` | Email+password, Google OAuth |
| Email | Resend SMTP | Configured in Supabase dashboard; no app-level Resend client in 1.1 |
| Hosting | Vercel | Single region; Node runtime for proxy |
| Package manager | npm | Per the project's existing `package-lock.json` |
| Test runner | Vitest (minimal use only in 1.1) | Used for `sanitizeNext` + `env` tests |

### 4.2 Runtime topology

Three distinct DB connection paths:

1. **User-scoped Drizzle (default for app code).** `dbAsUser()` returns a Drizzle client backed by a `postgres-js` connection to Supabase's pooled URL. Before running queries, the factory opens a transaction and sets `request.jwt.claims` from the current Supabase session — this is what `auth.uid()` in RLS policies reads. Every Server Component and Server Action that touches DB uses this.
2. **System Drizzle (`dbSystem`).** Connects as the `postgres` role, bypassing RLS. Only used by `db/seed.ts` and `scripts/smoke-rls.ts`. An ESLint rule blocks imports of `dbSystem` from anywhere inside `app/` or `lib/`.
3. **Supabase SDK clients** — three flavors:
   - `lib/supabase/server.ts` — `createServerClient` bound to Next's async `cookies()`. Used in Server Components, Server Actions, Route Handlers.
   - `lib/supabase/proxy.ts` — `createServerClient` with a proxy-specific cookie adapter. Used only from `proxy.ts`.
   - `lib/supabase/client.ts` — `createBrowserClient`. Used only in Client Components; in 1.1, only by `<GoogleButton />` for `signInWithOAuth`.

### 4.3 Project layout

```
bookshelf/
├── app/
│   ├── (auth)/
│   │   ├── layout.tsx                   # centered card layout for auth pages
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   ├── forgot-password/page.tsx
│   │   └── reset-password/page.tsx
│   ├── auth/callback/route.ts           # OAuth + email confirm + password reset
│   ├── layout.tsx                       # root
│   ├── page.tsx                         # gated home
│   ├── error.tsx
│   └── not-found.tsx
├── components/
│   ├── ui/                              # shadcn primitives
│   ├── auth/
│   │   ├── login-form.tsx
│   │   ├── signup-form.tsx
│   │   ├── google-button.tsx            # Client Component
│   │   ├── forgot-password-form.tsx
│   │   └── reset-password-form.tsx
│   └── app-header.tsx                   # user greeting + logout
├── db/
│   ├── schema/
│   │   ├── auth.ts                      # profiles
│   │   ├── libraries.ts                 # libraries, library_members, library_invites
│   │   ├── catalog.ts                   # books, loans, borrowers, currencies
│   │   └── index.ts
│   ├── migrations/                      # Drizzle Kit generated + hand-written SQL
│   ├── seed.ts                          # currencies seed
│   └── client-server.ts                 # dbAsUser, dbSystem
├── lib/
│   ├── supabase/
│   │   ├── server.ts
│   │   ├── client.ts
│   │   └── proxy.ts
│   ├── actions/
│   │   └── auth.ts                      # login, signup, logout, forgotPassword, resetPassword
│   ├── auth/
│   │   ├── redirect.ts                  # sanitizeNext
│   │   └── redirect.test.ts             # Vitest unit test
│   ├── env.ts
│   └── env.test.ts
├── scripts/
│   └── smoke-rls.ts                     # security smoke test
├── docs/superpowers/specs/              # this file
├── proxy.ts                             # session gate
├── drizzle.config.ts
├── next.config.ts                       # remotePatterns, headers, serverActions
├── vitest.config.ts
├── eslint.config.mjs                    # flat config + custom no-dbSystem-in-app rule
└── .env.local.example
```

### 4.4 Environment variables (Zod-validated in `lib/env.ts`)

```bash
# Runtime connection (Supabase Transaction-mode pooler)
DATABASE_URL=postgres://...@*.pooler.supabase.com:6543/postgres
# Migrations only
DIRECT_URL=postgres://...@db.*.supabase.co:5432/postgres
# Supabase SDK
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
# Defaults
DEFAULT_CURRENCY=BDT                     # optional; falls back to 'BDT'
```

Env splits: `NEXT_PUBLIC_*` exposed to client; all others server-only. `lib/env.ts` crashes at import time on missing required vars with a Zod error listing each missing name. Service-role key and Resend API key are **not** in `.env.local` in 1.1 — they live in the Supabase dashboard (SMTP configuration). Service-role key enters the app env in 1.2 when we add the admin client.

## 5. Data model

### 5.1 Cross-cutting conventions (DRY)

- Primary keys: `uuid DEFAULT gen_random_uuid()` (PG13+ built-in; no extension).
- Timestamps: all tables have `created_at timestamptz NOT NULL DEFAULT now()`. Mutable tables add `updated_at timestamptz NOT NULL DEFAULT now()`.
- One `trigger_set_updated_at()` function, applied to every mutable table via `BEFORE UPDATE` trigger.
- Every tenant table (`books`, `loans`, `borrowers`) has `library_id uuid NOT NULL REFERENCES libraries(id) ON DELETE CASCADE`.
- Hard delete + cascade, no soft-delete flags.
- Enums declared once as native PG enums.

### 5.2 Enums

```sql
CREATE TYPE library_role AS ENUM ('owner', 'admin');
CREATE TYPE acquisition_status AS ENUM ('owned', 'wishlist');
```

### 5.3 Tables

**`profiles`** — app-owned mirror of `auth.users`, keyed identically.

| Column | Type | Constraints |
| --- | --- | --- |
| id | uuid | PK, `REFERENCES auth.users(id) ON DELETE CASCADE` |
| display_name | text | nullable |
| email | text | synced via trigger from `auth.users` |
| phone | text | synced; nullable |
| avatar_url | text | nullable |
| created_at, updated_at | timestamptz | |

Triggers: `on_auth_user_created` (INSERT), `on_auth_user_updated` (keeps email/phone in sync).

**`libraries`**

| Column | Type | Constraints |
| --- | --- | --- |
| id | uuid | PK |
| name | text | NOT NULL |
| created_by | uuid | `REFERENCES auth.users(id) ON DELETE SET NULL` |
| created_at, updated_at | timestamptz | |

Invariant (exactly one owner) enforced via (a) partial unique index on `library_members` (below), and (b) trigger on `library_members` blocking DELETE/UPDATE that would strand a library without an owner (unless the library itself is being deleted — CASCADE bypasses).

**`library_members`**

| Column | Type | Constraints |
| --- | --- | --- |
| library_id | uuid | FK → `libraries(id)` CASCADE |
| user_id | uuid | FK → `auth.users(id)` CASCADE |
| role | library_role | NOT NULL |
| joined_at | timestamptz | NOT NULL DEFAULT now() |
| PRIMARY KEY | (library_id, user_id) | |

Indexes:
- `CREATE UNIQUE INDEX idx_library_members_one_owner ON library_members(library_id) WHERE role = 'owner';`
- `CREATE INDEX idx_library_members_user ON library_members(user_id);`

**`library_invites`**

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | PK |
| library_id | uuid | FK → libraries CASCADE |
| role | library_role | role on acceptance (typically `'admin'`) |
| invited_email | text | nullable |
| invited_phone | text | nullable (schema-only in 1.1) |
| token_hash | bytea | SHA-256 of the plaintext token (never store plaintext) |
| invited_by | uuid | FK → auth.users ON DELETE SET NULL |
| created_at | timestamptz | |
| expires_at | timestamptz | NOT NULL, default `now() + interval '7 days'` |
| accepted_at | timestamptz | nullable |
| accepted_by | uuid | FK → auth.users, nullable |
| revoked_at | timestamptz | nullable |

Constraints:
- `CHECK (invited_email IS NOT NULL OR invited_phone IS NOT NULL)`
- `CHECK (accepted_at IS NULL OR revoked_at IS NULL)` — mutually exclusive terminal states.
- `CHECK ((accepted_at IS NULL) = (accepted_by IS NULL))` — accept fields move together.
- `UNIQUE (token_hash)`
- Partial unique indexes to prevent spamming:
  ```sql
  CREATE UNIQUE INDEX idx_invites_pending_email
    ON library_invites (library_id, lower(invited_email))
    WHERE invited_email IS NOT NULL
      AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now();
  CREATE UNIQUE INDEX idx_invites_pending_phone
    ON library_invites (library_id, invited_phone)
    WHERE invited_phone IS NOT NULL
      AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now();
  ```
- Index on `library_id` for listing pending invites.

**`currencies`** — reference data, seeded.

| Column | Type | Notes |
| --- | --- | --- |
| code | char(3) | PK (ISO 4217) |
| symbol | text | NOT NULL |
| name | text | NOT NULL |

Seed: `('BDT', '৳', 'Bangladeshi Taka')`, `('USD', '$', 'US Dollar')`.

**`borrowers`**

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | PK |
| library_id | uuid | FK → libraries CASCADE |
| name | text | NOT NULL |
| contact | text | nullable (free text) |
| notes | text | nullable |
| created_at, updated_at | timestamptz | |

Additional unique key for composite FK: `UNIQUE (id, library_id)`. Index on `library_id`.

**`books`**

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | PK |
| library_id | uuid | FK → libraries CASCADE |
| title | text | NOT NULL |
| author | text | free-text |
| isbn | text | nullable |
| cover_url | text | nullable; Open Library URL hotlinked |
| acquisition | acquisition_status | NOT NULL, default `'owned'` |
| purchase_date | date | nullable |
| purchase_price | numeric(12,2) | nullable |
| purchase_currency | char(3) | FK → currencies(code), nullable |
| purchase_source | text | nullable |
| notes | text | nullable |
| created_at, updated_at | timestamptz | |

Constraints / indexes:
- `UNIQUE (library_id, isbn) WHERE isbn IS NOT NULL` — same ISBN allowed across libraries, not within.
- `UNIQUE (id, library_id)` — composite FK target for `loans`.
- `CHECK (purchase_price IS NULL OR purchase_price >= 0)`
- `CHECK ((purchase_price IS NULL) = (purchase_currency IS NULL))`
- `INDEX (library_id, acquisition)`

**`loans`**

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | PK |
| library_id | uuid | NOT NULL |
| book_id | uuid | NOT NULL |
| borrower_id | uuid | NOT NULL |
| lent_date | date | NOT NULL |
| expected_return_date | date | nullable |
| returned_date | date | nullable; NULL = still out |
| notes | text | nullable |
| created_at | timestamptz | (no `updated_at` — loans are event-like) |

Composite FKs (enforce cross-library integrity at DB level):
- `FOREIGN KEY (book_id, library_id) REFERENCES books(id, library_id) ON DELETE CASCADE`
- `FOREIGN KEY (borrower_id, library_id) REFERENCES borrowers(id, library_id) ON DELETE RESTRICT`

Constraints:
- `CHECK (expected_return_date IS NULL OR expected_return_date >= lent_date)`
- `CHECK (returned_date IS NULL OR returned_date >= lent_date)`
- `CREATE UNIQUE INDEX idx_loans_one_active ON loans(book_id) WHERE returned_date IS NULL;`
- **App-layer check** (not expressible cleanly in SQL): Server Actions verify `books.acquisition = 'owned'` inside a `SELECT ... FOR UPDATE` before inserting a loan. Documented app-level invariant; book CRUD / loan creation is 1.2 work.

Indexes: `INDEX (book_id)`, `INDEX (borrower_id)`, `INDEX (library_id)`.

### 5.4 Invariants — enforcement matrix

| Invariant | Enforced by |
| --- | --- |
| Every library has exactly one owner | DB: partial unique index + trigger |
| `auth.users` → `profiles` + personal library exists for every user | DB: trigger |
| `profiles.email` / `profiles.phone` match `auth.users` | DB: trigger |
| Pending invites unique per (library, email/phone) | DB: partial unique index |
| Invite can't be both accepted and revoked | DB: CHECK |
| Invite accept fields move together | DB: CHECK |
| Invite tokens unique | DB: unique index on `token_hash` |
| Book + borrower referenced by loan belong to same library | DB: composite FK |
| At most one active loan per book | DB: partial unique index |
| Loan dates coherent | DB: CHECK |
| Loan only against `acquisition = 'owned'` | **App (Server Action, 1.2)** |
| Library isolation per user | **DB: RLS policies** |
| Invite token unguessable | App: 256-bit random, SHA-256 hashed at rest |

## 6. Auth & session flows

### 6.1 Routes

| Path | Type | Public? | Purpose |
| --- | --- | --- | --- |
| `/login` | Server Component | yes | Email/password + Google |
| `/signup` | Server Component | yes | Email/password/display_name + Google |
| `/forgot-password` | Server Component | yes | Email input → reset email |
| `/reset-password` | Server Component | yes (token-gated via Supabase) | Lands from reset email; sets new password |
| `/auth/callback` | Route Handler | yes | Code exchange (OAuth + email confirm + password reset) |
| `/` | Server Component | gated | Home: greets user, shows personal library, logout button |
| `/logout` | Server Action | — | Called via form POST; clears session, redirects |

### 6.2 Flows

**Email/password signup:**
1. `/signup` form → Server Action `signUpAction`.
2. Zod validates `{ email, password (≥ 12 chars), display_name }`.
3. `supabase.auth.signUp(...)` with `options.data.display_name`.
4. DB trigger on `auth.users` INSERT creates `profiles` + personal `libraries` row + `library_members(owner)` atomically.
5. Render "Check your email to confirm your account" — same message whether the email was new or already registered (enumeration-safe).
6. User clicks link → `/auth/callback?code=...&next=/` → `supabase.auth.exchangeCodeForSession(code)` → cookies set → redirect to `sanitizeNext(next) ?? '/'`.

**Email/password login:**
1. `/login` form → `loginAction`.
2. `supabase.auth.signInWithPassword(...)`.
3. Success: redirect to `sanitizeNext(next) ?? '/'`.
4. Failure: render `"Invalid email or password"` (generic; no enumeration).

**Google OAuth:**
1. `<GoogleButton />` (Client Component) calls `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: \`${origin}/auth/callback?next=${next}\` } })`.
2. Browser → Google → `/auth/callback?code=...&next=...`.
3. Same callback handler exchanges code, sets cookies, redirects.
4. First-time Google sign-in: same DB trigger fires on `auth.users` INSERT; no divergence.

**Logout:**
1. `<form action={logoutAction}>` on the header.
2. `supabase.auth.signOut()` clears cookies; redirect to `/login`.

**Forgot / reset password:**
1. `/forgot-password` → `forgotPasswordAction` → `supabase.auth.resetPasswordForEmail(email, { redirectTo: \`${origin}/reset-password\` })`.
2. Render enumeration-safe message: `"If that email is registered, we've sent a reset link."`
3. User clicks email link → `/reset-password` (Supabase sets a temporary session on the click).
4. Form → `resetPasswordAction` → `supabase.auth.updateUser({ password })` → redirect to `/`.

### 6.3 `proxy.ts` — session gate

```ts
// proxy.ts
import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
```

`updateSession` logic (in `lib/supabase/proxy.ts`):
1. Create server Supabase client with a proxy-specific cookie adapter.
2. `await supabase.auth.getUser()` — refreshes stale access tokens.
3. Routing rules:
   - `user && pathname ∈ {/login, /signup}` → redirect `/`.
   - `!user && pathname ∉ PUBLIC_PATHS` → redirect `/login?next=<pathname+search>`.
   - Otherwise return response with refreshed cookies.
4. `PUBLIC_PATHS = ['/login', '/signup', '/forgot-password', '/reset-password', '/auth/callback']`.

Returns the `NextResponse` with refreshed Supabase cookies attached.

### 6.4 `sanitizeNext(next)`

In `lib/auth/redirect.ts`. Rules:
- `null` / empty → `'/'`.
- Must start with `/` and not `//`.
- Must not contain `\`.
- Must not equal `/login` or `/signup` (loop prevention).
- Must not contain protocol (`://`).
- Otherwise return as-is.

Unit-tested in `lib/auth/redirect.test.ts`.

### 6.5 Drizzle under RLS

`dbAsUser()`:
1. Gets current Supabase session via `createServerClient()`.
2. Throws if unauthenticated (called only from gated code).
3. Creates a request-scoped `postgres-js` client (Supabase pooled URL, `prepare: false`).
4. Wraps the returned Drizzle instance so all queries run inside a transaction that first executes `SELECT set_config('request.jwt.claims', <claims-json>, true)`.
5. Supabase's RLS function `auth.uid()` reads `request.jwt.claims.sub` to enforce policies.

`dbSystem()` exists only for `db/seed.ts` and `scripts/smoke-rls.ts`. ESLint rule blocks imports from `app/` or `lib/`.

### 6.6 Error handling

- Login: generic `"Invalid email or password"`.
- Signup: generic `"Check your email to confirm your account"` (Supabase re-sends silently on duplicate).
- Forgot password: generic `"If that email is registered, we've sent a reset link."`
- OAuth callback: `?error=...` → error page with "Try again".
- Trigger failure during signup: atomic with Supabase's `auth.users` insert — either all succeed or all fail. User-facing message: `"Signup failed. Please try again."` with server-side logging.
- CSRF: Next.js 16 Server Actions validate Origin against `next.config.ts` `experimental.serverActions.allowedOrigins`.

## 7. Security

### 7.1 RLS strategy

- RLS **enabled and FORCED** on all 8 tables. Even the table owner is subject to policies.
- Helper functions are `SECURITY DEFINER` to avoid recursion on `library_members`.
- Complex ops (invites, ownership transfer) use `SECURITY DEFINER` procedures — not fragmented policy logic.

### 7.2 Helper functions

```sql
CREATE OR REPLACE FUNCTION fn_library_access(p_library_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM library_members
    WHERE library_id = p_library_id AND user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION fn_library_role(p_library_id uuid)
RETURNS library_role
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM library_members
  WHERE library_id = p_library_id AND user_id = auth.uid()
$$;

REVOKE EXECUTE ON FUNCTION fn_library_access(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_library_role(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION fn_library_access(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION fn_library_role(uuid) TO authenticated;
```

### 7.3 Per-table policies (summary)

**Tenant tables (`books`, `loans`, `borrowers`):** four-policy template, identical shape each:
```sql
ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <t> FORCE ROW LEVEL SECURITY;
CREATE POLICY <t>_select ON <t> FOR SELECT USING (fn_library_access(library_id));
CREATE POLICY <t>_insert ON <t> FOR INSERT WITH CHECK (fn_library_access(library_id));
CREATE POLICY <t>_update ON <t> FOR UPDATE USING (fn_library_access(library_id)) WITH CHECK (fn_library_access(library_id));
CREATE POLICY <t>_delete ON <t> FOR DELETE USING (fn_library_access(library_id));
```

**`profiles`:**
- `profiles_select_self`: `id = auth.uid()`.
- `profiles_select_co`: can see profiles of users sharing at least one library.
- `profiles_update_self`: `id = auth.uid()`.
- No INSERT/DELETE policies (trigger + CASCADE handle them).

**`libraries`:**
- `libraries_select`: `fn_library_access(id)`.
- `libraries_insert`: `created_by = auth.uid()`.
- `libraries_update`: `fn_library_role(id) IN ('owner','admin')`.
- `libraries_delete`: `fn_library_role(id) = 'owner'`.

**`library_members`:**
- `members_select_self`: `user_id = auth.uid()`.
- `members_select_co`: `fn_library_access(library_id)`.
- `members_insert_initial_owner`: allowed only when creating the first owner of a library the user created.
- `members_delete_self`: admin self-removes.
- `members_delete_admin`: owner removes an admin (not the owner).
- No direct UPDATE policy — role change only via `fn_transfer_ownership`.

**`library_invites`:**
- `invites_select`: `fn_library_role(library_id) IN ('owner','admin')`.
- No INSERT/UPDATE/DELETE policies — all writes go through SECURITY DEFINER functions.

**`currencies`:**
- `currencies_read`: `USING (true)`.
- No write policies.

### 7.4 SECURITY DEFINER operations

| Function | Purpose |
| --- | --- |
| `fn_send_invite(library_id, role, email, phone, token_hash)` | Validates caller is owner/admin of the library; inserts invite row with token_hash (app generates plaintext + hash, passes hash in); returns invite id. |
| `fn_accept_invite(token_plaintext)` | Hashes input; looks up unexpired, unaccepted, unrevoked invite; verifies caller's email or phone matches; inserts `library_members(role)` row; marks invite accepted. Atomic. |
| `fn_revoke_invite(invite_id)` | Validates caller is owner/admin of the invite's library; sets `revoked_at = now()`. |
| `fn_transfer_ownership(library_id, new_owner_user_id)` | Validates caller is current owner; demotes self to admin and promotes new owner. Atomic. |

All four have `SET search_path = public`, `REVOKE EXECUTE FROM PUBLIC`, `GRANT EXECUTE TO authenticated`. Arguments strictly typed (uuid, bytea, text).

### 7.5 Security checklist beyond RLS

| Area | Measure |
| --- | --- |
| Auth cookies | Supabase SSR defaults: HttpOnly, Secure (prod), SameSite=Lax. Access token 1h; refresh rotated. |
| Password policy | Supabase dashboard: min length 12, require digit + special, **HIBP breached-password check enabled**. |
| OAuth | PKCE (Supabase SSR default). |
| CSRF | Next.js 16 Server Actions validate Origin. `allowedOrigins` configured per environment. |
| Security headers | `next.config.ts` `headers()` returns: CSP (script-src self + Supabase hostnames + Google), HSTS (max-age=63072000; includeSubDomains; preload), X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy: strict-origin-when-cross-origin, Permissions-Policy: deny camera/mic/geo. |
| Image hotlinking | `images.remotePatterns` allowlist: only `covers.openlibrary.org`. |
| Secrets | Service-role key not in `.env.local` in 1.1. `.env.local` is in `.gitignore`. `lib/env.ts` distinguishes public vs server-only. |
| Error masking | Next.js default prod behavior (no stack traces in responses). Done-line verifies. |
| Rate limiting | Supabase Auth built-in limits for login/signup/password reset. |
| Redirect safety | `sanitizeNext` rejects `//`, `\`, `://`, auth loops. Unit tested. |
| SECURITY DEFINER hygiene | All have explicit `SET search_path = public`; `REVOKE FROM PUBLIC`; typed args. |
| Invite token storage | Plaintext sent in link only; SHA-256 `token_hash` stored. Unique index on hash. |
| Audit logging | Supabase Auth dashboard logs signups/logins/resets. App-level audit deferred. |
| Dependency hygiene | `npm audit` on every install; Dependabot on the repo. |
| Loud failure | `lib/env.ts` throws on missing env; broken auth fails loud, not silent. |

## 8. UI shell

### 8.1 Pages

Already listed in §6.1. All four auth forms follow the same pattern: shadcn `<Form>` + React Hook Form + Zod resolver, submitting to the matching Server Action. Form files ≤80 lines each.

### 8.2 Home page content (`/`)

Rendered by a Server Component using `dbAsUser()` joining `profiles`, `library_members`, `libraries`:

```
Hello, {display_name}.
You're in {library_name}.
Signed in as {email}.
[Logout]
```

The sole purpose of this page is to prove end-to-end: auth → session cookie → proxy passes → Drizzle query under RLS → JSX renders.

## 9. Testing strategy

Three targeted tests in 1.1; no broader test suite.

1. **`lib/auth/redirect.test.ts`** — Vitest unit tests for `sanitizeNext`:
   - `null`, empty, `'/books'`, `'//evil.com'`, `'\\evil.com'`, `'https://evil.com'`, `'/login'`, `'/signup'`, random fuzz.
2. **`lib/env.test.ts`** — Vitest: missing required var throws at import.
3. **`scripts/smoke-rls.ts`** — node script using `dbSystem` + service-role to create two test users A and B, then verify via user-scoped connections that:
   - A sees their own `library_members` row (and no others).
   - A cannot SELECT B's library or its membership.
   - A cannot INSERT `books` into B's library.
   - A cannot UPDATE B's library name.
   - A creates a new library and the insert policy permits self-owner insertion.
   - `fn_accept_invite` rejects a bogus token.
   - Tear-down deletes both test users (cascades clean up).
   - Exits non-zero on any failure. Runnable via `npm run smoke:rls`.

No test framework overhead beyond Vitest for the two small unit tests.

## 10. Done-line (acceptance criteria)

Each item is independently verifiable.

**Infrastructure:**
- [ ] `npm install && npm run db:migrate && npm run db:seed && npm run dev` runs cleanly on a fresh clone.
- [ ] Missing required env → app crashes at import with Zod error listing each missing name.
- [ ] `next.config.ts` sets CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, `images.remotePatterns` for `covers.openlibrary.org`, `experimental.serverActions.allowedOrigins`.
- [ ] `proxy.ts` matcher excludes static assets; redirects `!user` → `/login?next=...`; redirects `user && /login|/signup` → `/`.
- [ ] Supabase dashboard: Resend SMTP configured; email templates use the Resend sender domain.

**Auth:**
- [ ] Email/password signup: confirmation email arrives from Resend, clicking confirms and lands on `/`.
- [ ] Email/password login with correct creds succeeds; with wrong creds shows `"Invalid email or password"`.
- [ ] Google OAuth signup/login end-to-end.
- [ ] Logout clears cookies and redirects to `/login`.
- [ ] Forgot password email arrives from Resend, reset flow completes, user can log in with new password.
- [ ] Stale access tokens are refreshed by `proxy.ts` transparently.

**Data model & RLS:**
- [ ] On any signup method, `profiles` + personal `libraries` (`<display_name>'s Library`) + `library_members(owner)` rows exist atomically.
- [ ] `npm run smoke:rls` passes all assertions.
- [ ] `SELECT relname FROM pg_class WHERE relrowsecurity AND relforcerowsecurity AND relnamespace = 'public'::regnamespace` includes all 8 public tables.

**Security hygiene:**
- [ ] `curl -I` on production shows CSP, HSTS, X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy, Permissions-Policy.
- [ ] `/login?next=//evil.com` followed by login still redirects to `/`.
- [ ] `grep -r SERVICE_ROLE .next/static` after build returns zero hits.
- [ ] Supabase dashboard: HIBP breached-password check enabled; password min length 12.
- [ ] All four SECURITY DEFINER functions: `SET search_path = public`; `REVOKE ... FROM PUBLIC`; strict argument types.

**Code quality:**
- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes.
- [ ] `npm run build` succeeds.
- [ ] `npm run test` passes (`sanitizeNext` + `env` tests).
- [ ] No import of `dbSystem` from `app/` or `lib/` (ESLint rule).

## 11. Design principles applied

- **Single Responsibility**: `proxy.ts` handles session only; RLS handles data isolation; Server Actions handle business rules; DB triggers handle atomic cross-table invariants. Four layers, four jobs.
- **DRY**: one `updated_at` trigger, one RLS helper pair, one `/auth/callback` for three flows, one form pattern, one library-scoping template for tenant tables.
- **Open/Closed**: adding an OAuth provider = no callback changes. Adding a new tenant table = add `library_id` + four-policy template + RLS on.
- **ETC**: invite infrastructure (tables, SECURITY DEFINER fns) shipped in 1.1 even without UI, so 1.2 is purely UI work.
- **Defense in depth**: proxy gate → RLS → SECURITY DEFINER constraints → Server Action validation. Any one layer compromised, others still hold.
- **Least privilege**: `authenticated` role has grants only through RLS + the four SECURITY DEFINER fns. `dbSystem` is isolated from app code by ESLint.
- **Least surprise**: hard deletes cascade; enums are closed sets; no "clever" columns; errors fail loud.
- **Security-first**: enumeration-safe messages, hashed invite tokens, HIBP-checked passwords, FORCED RLS, explicit search_path, PKCE, strict CSP.

## 12. Open questions / future work

- **SMS invites + phone OTP auth** — `invited_phone` column present from 1.1; implementation deferred.
- **Library switcher, create-library UI, member management UI** — 1.2.
- **Book / loan / borrower CRUD UI** — 1.2. App-layer `books.acquisition = 'owned'` check for loan creation also lands there.
- **ISBN lookup (Open Library), search, filter** — 1.3.
- **Admin (service-role) Supabase client in `app/`** — 1.2 when invite user-lookup arrives.
- **Resend email template customization** — 1.2 polish.
- **Broader test suite** — 1.2 introduces Vitest setup for book CRUD tests; Playwright or similar for integration in 1.3+.
- **Audit logging at app level** — future spec.
- **Deleting personal library** — currently permitted by policy; no UI surfaces it. If ever possible via API, add "auto-create on login if user has none" behavior. Parked.
