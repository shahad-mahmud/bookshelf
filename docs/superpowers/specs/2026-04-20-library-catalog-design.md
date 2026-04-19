# Spec 1.2 — Library Management + Book Catalog

| | |
| --- | --- |
| **Date** | 2026-04-20 |
| **Project** | Bookshelf |
| **Spec** | 1.2 — Library management UI + Book/Borrower CRUD (no lending yet) |
| **Phase** | Phase 1, second of three catalog specs (1.1 Foundation ✓ → 1.2 Library+Catalog → 1.3 ISBN+Search) |
| **Status** | Draft — pending user review |

## 1. Scope revision from plan.md

The original `docs_local/plan.md` split catalog work as **Phase 1 (catalog)** + **Phase 2 (lending)**. During 1.1 brainstorming I conflated them into a single "1.2 Library + Catalog". This spec re-splits honestly to match the original plan's boundaries:

- **1.2 (this spec)** — Library management + Book CRUD + Borrower CRUD. Manual book entry only.
- **1.3** — ISBN lookup via Open Library + search/filter (as originally planned).
- **1.4** — Lending (loan create/return, active loans view, borrower-grouped view, app-layer "only lend owned books" check). Corresponds to `plan.md` Phase 2.
- **1.5** — Polish: wishlist→owned conversion, stats, reminders, PWA. Corresponds to `plan.md` Phase 3.

1.4 and 1.5 get their own specs when we get there.

## 2. Goals

- User can create, rename, delete libraries beyond their auto-created personal library.
- User can switch libraries instantly from a header dropdown, with the current selection persisted in a cookie.
- Owner/admin can invite others by email (token link via Resend), revoke pending invites, and (owner) transfer ownership.
- Invitee can click an email link, log in if needed, and accept to join the library as admin.
- User can list, add, edit, delete books in the current library. Form covers all `books` columns: title, author, ISBN, cover URL, acquisition (owned/wishlist), purchase date/price/currency/source, notes.
- User can list, add, edit, delete borrowers in the current library.
- Book detail page renders all fields and cover image via `next/image` (hotlinked Open Library URLs permitted by `images.remotePatterns` from 1.1).
- Search/filter deferred to 1.3. Lending UI deferred to 1.4. Book detail shows a "Loans arriving in 1.4" placeholder in the loans section.

## 3. In-scope vs out-of-scope

**In scope:**
- Library switcher in `AppHeader`.
- `currentLibraryId` cookie + `setCurrentLibraryAction` server action.
- Create-library page + server action.
- Library settings page: rename, delete, member list (remove admin, leave, transfer ownership), invites tab (send, list pending, revoke).
- Accept-invite page + server action calling `fn_accept_invite`.
- Email sending via Resend (`resend` npm package) from a new `lib/email/` module.
- Book CRUD: list, new, detail, edit, delete.
- Borrower CRUD: list, new, detail, edit, delete.
- Shadcn additions: `dropdown-menu`, `dialog`, `alert-dialog`, `select`, `separator`, `tabs`, `textarea`.
- Vitest tests for Zod schemas, cookie helpers, invite-token generation.
- Extend `smoke-rls.ts` with invite send→accept round-trip and ownership-transfer check.

**Out of scope (deferred):**
- Loan create / mark returned / active-loan view / borrower-grouped lending view → 1.4.
- Loan-related fields on book detail (placeholder only).
- ISBN auto-lookup via Open Library → 1.3.
- Search / filter / sort on `/books` and `/borrowers` → 1.3 (or deferred further).
- Cover image upload / proxying to Supabase Storage (still hotlink-only).
- Profile editing (display name, avatar) — defer to 1.5 polish.
- Phone OTP auth, SMS invites — unchanged; still deferred.
- Pagination on list views — defer until first user's library crosses ~200 items.

## 4. Architecture

### 4.1 Current-library state

- Cookie name: `currentLibraryId` (HttpOnly, SameSite=Lax, 365-day maxAge).
- Set on login via the `on_auth_user_created` trigger's result: Server Component on the first gated page reads the user's personal library and sets the cookie if missing.
- Changed by the `setCurrentLibraryAction` Server Action invoked from the switcher. Action validates membership via `fn_library_access`; if not a member, falls back to the user's first-available library.
- Read pattern: a new `lib/library/current.ts` helper `getCurrentLibrary()` that returns `{ id, name, role }` — cookie value validated through an RLS-scoped SELECT. If validation fails, it picks the user's first membership and re-sets the cookie.
- Pages/components call `getCurrentLibrary()` at the top of server components to anchor all queries.

### 4.2 Route tree (new in 1.2)

```
app/
├── libraries/
│   ├── new/page.tsx                    # create-library form
│   └── [id]/
│       └── settings/
│           ├── layout.tsx              # gated: caller must be member; tabs: General | Members
│           ├── page.tsx                # General tab: rename, delete
│           └── members/page.tsx        # Members tab: list + invites
├── invites/
│   └── accept/page.tsx                 # public-ish; requires login; handles token
├── books/
│   ├── page.tsx                        # list
│   ├── new/page.tsx
│   └── [id]/
│       ├── page.tsx                    # detail
│       └── edit/page.tsx
└── borrowers/
    ├── page.tsx                        # list
    ├── new/page.tsx
    └── [id]/
        ├── page.tsx                    # detail
        └── edit/page.tsx
```

### 4.3 Server Actions (new files)

```
lib/actions/
├── library.ts        # createLibrary, renameLibrary, deleteLibrary, setCurrentLibrary, leaveLibrary, removeAdmin, transferOwnership
├── invite.ts         # sendInvite, acceptInvite, revokeInvite
├── book.ts           # createBook, updateBook, deleteBook
└── borrower.ts       # createBorrower, updateBorrower, deleteBorrower
```

Each file exports:
- A Zod schema (in a co-located `-schema.ts` file per 1.1 learnings — `'use server'` can only export async).
- One Server Action per operation.
- All actions call `dbAsUser()` and wrap DB work in `.query(tx => ...)`.
- All mutations call `revalidateTag(\`<entity>-${libraryId}\`, 'max')` + `revalidatePath('/books')` etc. to trigger server-side re-renders.

### 4.4 Email layer

```
lib/email/
├── client.ts         # wraps Resend client, env-validated
├── templates/
│   └── invite.tsx    # React email template (or plain HTML string for 1.2 simplicity)
└── send.ts           # sendInviteEmail({to, libraryName, inviteUrl})
```

- New env var `RESEND_API_KEY` (server-only, added to `lib/env-server.ts`).
- New env var `EMAIL_FROM` (e.g. `noreply@mail.bookshelf.example`) — sender address on a Resend-verified domain.
- `lib/email/send.ts` is the only module that imports `resend`. Callers pass typed inputs; module handles error/retry.
- Failure to send email does NOT roll back the invite row — invite is already persisted, so owner sees it as "pending" and can revoke/resend. Log the Resend error server-side.

### 4.5 Components

```
components/
├── library/
│   ├── library-switcher.tsx          # Client Component, dropdown in header
│   ├── library-form.tsx              # reused by new + settings/general
│   ├── member-row.tsx                # one row with remove/transfer/leave buttons
│   ├── invite-form.tsx               # send-invite dialog
│   └── pending-invite-row.tsx        # with revoke button
├── book/
│   ├── book-form.tsx                 # RHF + Zod; used by new + edit
│   ├── book-card.tsx                 # list item
│   └── book-cover.tsx                # wrapped next/image with fallback
├── borrower/
│   ├── borrower-form.tsx
│   └── borrower-row.tsx
├── app-header.tsx                    # UPDATED: adds library-switcher, leaves logout
└── ui/                               # shadcn (add dropdown-menu, dialog, alert-dialog, select, separator, tabs, textarea)
```

### 4.6 Data flow for invites (critical path)

```
Owner/admin clicks "Invite" in Members tab
  → <InviteForm> submits email
  → sendInviteAction(formData):
      1. Zod validates email.
      2. Validate caller is member of library (fn_library_role check).
      3. Generate token = crypto.randomBytes(32).toString('base64url')  -- 256 bits
      4. hash = sha256(token) as Buffer
      5. Call fn_send_invite(library_id, 'admin', email, null, hash) -- returns invite id
      6. Build inviteUrl = `${origin}/invites/accept?token=${token}` (plaintext in URL only)
      7. sendInviteEmail({to: email, libraryName, inviteUrl})
      8. revalidateTag(`invites-${libraryId}`)
      9. Return ActionState { ok: true, message: 'Invite sent.' }
      -- If email send fails, invite row still exists (can revoke/resend); log error.

Recipient opens email, clicks link
  → /invites/accept?token=xxx
  → If not logged in: redirect /login?next=/invites/accept?token=xxx
  → Once logged in, page renders:
      1. (Server Component) Call a `fn_lookup_invite(token_plaintext)` that returns library name + inviter name
         -- OR the page accepts immediately on load. 1.2 decision: show a confirmation screen.
         -- fn_lookup_invite is SECURITY DEFINER: hashes token, looks up invite, joins with libraries and profiles, returns {libraryName, inviterName, role} if valid.
      2. Shows "Join <libraryName>? Invited by <inviterName>."
      3. Accept button → acceptInviteAction(token):
          a. Zod validates token shape.
          b. Calls fn_accept_invite(token) -- server-side; hashes + validates + inserts membership atomically.
          c. Sets currentLibraryId cookie to the joined library.
          d. redirect('/')
      4. Decline = navigate away. No RPC.
```

Adds one new DB function: `fn_lookup_invite(token_plaintext text) RETURNS TABLE(library_id uuid, library_name text, role library_role, inviter_name text, inviter_email text)` — SECURITY DEFINER, `SET search_path = public, extensions`, returns zero rows if token invalid/expired/revoked/accepted. Migrated via new `db/migrations/0006_lookup_invite.sql`.

### 4.7 Data flow for switching library

```
User clicks library in dropdown
  → setCurrentLibraryAction(libraryId) (Server Action)
      1. Validate auth.uid() is a member (fn_library_access via dbAsUser).
      2. cookies().set('currentLibraryId', libraryId, { httpOnly: true, sameSite: 'lax', maxAge: 31536000 })
      3. revalidatePath('/', 'layout')
  → Next request: getCurrentLibrary() reads cookie, renders books for new library.
```

### 4.8 Delete-library guardrails

- Owner only. Policy `libraries_delete` already enforces.
- On delete, CASCADE wipes books/loans/borrowers/members/invites. (Invite rows cascade from `library_id`.)
- UI: `<AlertDialog>` with explicit "Type the library name to confirm" input. Button disabled until typed value matches.
- If the deleted library was the user's current, `setCurrentLibraryAction` auto-fallback on next request swaps to personal library.

### 4.9 Leave-library + transfer-ownership UX

- Admin: "Leave library" button in Members tab. Confirmation dialog. Server Action calls `DELETE FROM library_members WHERE library_id = ? AND user_id = auth.uid()` (policy `members_delete_self` permits).
- Owner: no "Leave library" button. Must transfer ownership first. Members tab shows a "Transfer ownership to…" dropdown listing admins. On select, calls `fn_transfer_ownership`. After transfer, owner becomes admin, can then click "Leave library".

## 5. Database additions

One new SQL migration: `db/migrations/0006_lookup_invite.sql`

```sql
CREATE OR REPLACE FUNCTION public.fn_lookup_invite(p_token_plaintext text)
RETURNS TABLE(
  library_id uuid,
  library_name text,
  role library_role,
  inviter_display_name text,
  inviter_email text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash bytea;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  v_hash := extensions.digest(p_token_plaintext, 'sha256');

  RETURN QUERY
  SELECT
    li.library_id,
    l.name AS library_name,
    li.role,
    p.display_name AS inviter_display_name,
    p.email AS inviter_email
  FROM public.library_invites li
  JOIN public.libraries l ON l.id = li.library_id
  LEFT JOIN public.profiles p ON p.id = li.invited_by
  WHERE li.token_hash = v_hash
    AND li.accepted_at IS NULL
    AND li.revoked_at IS NULL
    AND li.expires_at > now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_lookup_invite(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_lookup_invite(text) TO authenticated;
```

Journal entry idx 6. No schema changes.

## 6. Environment variables (additions to `lib/env-server.ts`)

```ts
RESEND_API_KEY: z.string().min(1),
EMAIL_FROM: z.email(),
```

`.env.local.example` gains:
```bash
# Resend (transactional email — invite links)
RESEND_API_KEY=re_...
EMAIL_FROM=noreply@mail.yourdomain.com
```

## 7. UI shell changes

- `AppHeader` gains `<LibrarySwitcher />` between user info and logout button.
- Header becomes a server component wrapper around a client `<LibrarySwitcher>` child. Wrapper pre-renders the user's memberships list so the dropdown doesn't need a round-trip on open.
- A global "breadcrumb" under the header showing current library name + role badge (optional — keep simple; may be part of `LibrarySwitcher` label itself).

## 8. Testing

### Vitest unit tests

- `lib/actions/library-schema.test.ts` — Zod schemas for library name.
- `lib/actions/book-schema.test.ts` — Zod schemas: title required, price+currency paired validation, ISBN format (if we add a check).
- `lib/actions/invite-schema.test.ts` — token shape, email format.
- `lib/email/send.test.ts` — mocks Resend, verifies the action passes correct args (subject, html, to, from). This is the one mock we allow in 1.2 — the email provider boundary.
- `lib/library/current.test.ts` — cookie roundtrip: set → read → invalid cookie falls back.

### Integration (extending smoke-rls)

New file `scripts/smoke-invite.ts` (or extension of existing smoke-rls):
- Create user A, create library L owned by A.
- Create user B (with known email).
- As A: generate token, call `fn_send_invite(L, 'admin', B.email, null, hash)`.
- As B: call `fn_lookup_invite(token)` — expect library L returned.
- As B: call `fn_accept_invite(token)` — expect membership row.
- Verify B can now SELECT library L under RLS.
- As B: call `fn_accept_invite(token)` again — expect error (already accepted).
- Transfer ownership: as A, `fn_transfer_ownership(L, B.id)` — expect A's role flips to admin, B's to owner.
- Teardown.

Runnable via `npm run smoke:invite`. Should be a mandatory gate before 1.2 done-line.

### Manual browser tests

- Create library → lands in settings page.
- Switcher shows both libraries; switching changes the books list context.
- Invite to library → email arrives → accept in incognito with different account → invitee sees the shared library.
- Transfer ownership in settings.
- Delete library: type-to-confirm dialog blocks until name matches.
- Book CRUD happy path.
- Borrower CRUD happy path.
- All forms show Zod errors inline.

## 9. Security checklist (beyond 1.1)

| Area | Measure |
| --- | --- |
| Invite token | 256-bit, base64url, SHA-256 hashed at rest, never logged |
| Token URL hygiene | Plaintext appears only in the outbound email link; accept page does not echo to screen or console |
| Email sender | Resend API key server-only; sender domain must be DKIM/SPF-verified in Resend |
| Settings authorization | Each settings action re-checks `fn_library_role`; RLS is backup, not primary |
| Delete confirmation | Type-to-match before delete-library; confirmation dialog before delete-book |
| CSRF | Same as 1.1 — Next 16 Server Action origin check |
| Resend outage | Invite row persists; revoke/resend path available |
| Enumeration safety | `/invites/accept` with bad token shows "Invite not found or expired" (generic) |
| Cookie scope | `currentLibraryId` HttpOnly, SameSite=Lax, not sensitive on its own (bound to user via session + server-side membership check) |

## 10. Done-line (acceptance)

- [ ] `npm run db:apply` applies 0006 without error.
- [ ] `npm run typecheck && npm run lint && npm run test && npm run build` all green.
- [ ] Resend domain verified; `EMAIL_FROM` matches verified sender.
- [ ] Create-library flow: URL lands on settings page; user has owner role.
- [ ] Rename library → change visible in header switcher.
- [ ] Delete library (type-to-confirm): library gone; switcher falls back to personal; current cookie auto-resets.
- [ ] Invite send → email arrives from Resend with working link.
- [ ] Accept (second account, incognito) → joined library appears in that user's switcher.
- [ ] Transfer ownership: roles swap atomically (verified via SQL check).
- [ ] `npm run smoke:rls && npm run smoke:invite` both pass.
- [ ] Book CRUD manual test: add, edit, delete, detail page renders cover image (if URL given).
- [ ] Borrower CRUD manual test.
- [ ] No `RESEND_API_KEY` in `.next/static/` after production build.
- [ ] Security headers unchanged from 1.1 (verify via curl).
- [ ] ESLint rule blocks direct `resend` imports outside `lib/email/` (add new rule).

## 11. Design principles applied

- **DRY**: single `bookSchema`, `borrowerSchema`, `librarySchema` reused by form + action. One `getCurrentLibrary()` called from every server component that touches the library scope.
- **SRP**: `lib/email/send.ts` is the only Resend consumer. `lib/actions/*.ts` files are thin: validate → DB → revalidate → return. DB business logic (invite lifecycle) lives in SECURITY DEFINER procedures.
- **Defense in depth**: UI buttons gated by `fn_library_role` at render time; Server Actions re-check on submit; RLS is the last line.
- **Least privilege**: The only new DB function exposed to `authenticated` is `fn_lookup_invite`, read-only by design.
- **ETC**: `lib/email/` isolates the provider — swapping Resend for AWS SES later is one file.
- **Observable done-ness**: `smoke-invite` locks in the happy path end-to-end before a human has to poke at UI.

## 12. Open questions / deferred

- ISBN auto-lookup, search, filter, sort → 1.3.
- Lending (loan create/return/view, "only owned" app-check) → 1.4.
- Profile editing (display name, avatar upload) → 1.5.
- Email templates via `react-email` — kept plain HTML/text in 1.2; upgrade in 1.5 polish.
- Rate limiting invite sends (per library/day) — not in 1.2; revisit if abuse.
- Audit log for membership changes — deferred.
- Bulk operations on books/borrowers — deferred.
