# Loan Tracking — Design Spec

**Date:** 2026-04-21  
**Spec:** 1.5

---

## Goal

Allow library members to record lending a book to someone, track when it's due back, and mark it returned — all from the book detail page, with an at-a-glance overview on the dashboard.

---

## Schema (already in place)

The database schema is complete. No migrations needed.

- **`borrowers`** — `id`, `libraryId`, `name`, `contact` (optional), `notes` (optional), timestamps
- **`loans`** — `id`, `libraryId`, `bookId`, `borrowerId`, `lentDate`, `expectedReturnDate` (optional), `returnedDate` (optional — NULL = active loan), `notes`, `createdAt`
- Unique index on `(bookId)` where `returnedDate IS NULL` — enforces one active loan per book at the DB level
- Borrower deletion is blocked while they have loan history (already enforced in `lib/actions/borrower.ts`)

---

## Feature Areas

### 1. Lending flow — book detail page (`app/books/[id]/page.tsx`)

The existing placeholder ("Loan tracking arrives in Spec 1.4") is replaced with real UI.

**When book is available (no active loan, acquisition = owned):**
- A **"Lend"** button is shown
- Clicking opens a dialog (`LendBookDialog`) with:
  - **Borrower** — combobox: search existing borrowers by name, or type a new name to create one inline. Inline creation captures name (required) and contact (optional). The new borrower is created atomically with the loan.
  - **Lent date** — date input, defaults to today
  - **Expected return date** — optional date input
  - **Notes** — optional textarea
- On submit: server action creates the loan (and borrower if new) in a single transaction

**When book is currently lent (active loan exists):**
- Shows: "Lent to [Borrower name] · [lent date]" with optional "Expected back [date]"
- Expected return date shown in red if overdue (past today)
- A **"Mark Returned"** button — server action sets `returnedDate = today`
- **Loan history** section below: all past loans for this book, sorted newest first. Columns: Borrower, Lent, Returned.

**When book is a wishlist item:** no loan UI shown.

### 2. Book list — lent badge (`components/book/book-card.tsx`)

Each `BookCard` receives an optional `isLent: boolean` prop. When true, a small "Lent" badge is shown on the card. The books list page query is extended to join active loans and pass this flag.

### 3. Dashboard overview — active loans (`app/page.tsx`)

A new **"Active Loans"** section added below the nav tiles.

- Queries all loans for the current library where `returnedDate IS NULL`, joined with book and borrower names
- Each row shows: book title (link to `/books/[id]`), borrower name, lent date, expected return date
- Expected return date shown in red if overdue
- Inline **"Mark Returned"** button per row
- Empty state: "No books currently lent out." (section still renders to avoid layout jump)
- Section only shown if `acquisition = owned` books exist

### 4. Borrower detail — loan history (`app/borrowers/[id]/page.tsx`)

The existing placeholder is replaced with a **Loan History** section:
- Lists all loans for this borrower, sorted newest first
- Each row: book title (link to `/books/[id]`), lent date, returned date or "Active" badge
- Empty state: "No loans recorded yet."

---

## Server Actions

| Action | File | Behaviour |
|---|---|---|
| `lendBookAction` | `lib/actions/loan.ts` | Creates loan. If `newBorrower` payload provided, creates borrower first in same transaction. Validates: book must be owned, no active loan exists (DB constraint is the final guard). |
| `returnBookAction` | `lib/actions/loan.ts` | Sets `returnedDate = today` on the active loan for a given `loanId`. |

Both actions use `dbAsUser()` so RLS applies.

---

## Validation (Zod)

`lib/actions/loan-schema.ts`:
- `lendSchema` — `bookId` (uuid), `borrowerId` (uuid, optional), `newBorrower` (`{ name: string, contact?: string }`, optional). Exactly one of `borrowerId` or `newBorrower` must be present (refined check).
- `lentDate` — ISO date string, required
- `expectedReturnDate` — ISO date string, optional, must be ≥ lentDate if provided
- `returnSchema` — `loanId` (uuid)

---

## Components

| Component | File | Purpose |
|---|---|---|
| `LendBookDialog` | `components/loan/lend-book-dialog.tsx` | Dialog with borrower combobox + date fields |
| `BorrowerCombobox` | `components/loan/borrower-combobox.tsx` | Combobox for selecting or creating a borrower inline |
| `ActiveLoanCard` | `components/loan/active-loan-card.tsx` | Shows current loan status + Mark Returned button on book detail |
| `LoanHistoryTable` | `components/loan/loan-history-table.tsx` | Reusable past-loans table used on book detail and borrower detail |
| `ActiveLoansSection` | `components/loan/active-loans-section.tsx` | Dashboard section listing all active loans |

---

## Data Flow

1. **Lend:** Book detail page → `LendBookDialog` → `lendBookAction` → creates borrower (if new) + loan in transaction → revalidates book detail path
2. **Return (from book detail):** `ActiveLoanCard` "Mark Returned" → `returnBookAction` → revalidates book detail path
3. **Return (from dashboard):** `ActiveLoansSection` "Mark Returned" → `returnBookAction` → revalidates home path
4. **Book list lent badge:** `app/books/page.tsx` query adds LEFT JOIN on active loans → passes `isLent` to `BookCard`

---

## Error Handling

- DB unique constraint violation on active loan → server action catches and returns `{ error: 'This book already has an active loan.' }`
- `returnBookAction` called with a loan that's already returned → no-op (idempotent update where `returnedDate IS NULL`)
- Borrower not found during lend → server action returns validation error

---

## Out of Scope

- Loan notifications / reminders
- Overdue reporting / export
- Editing a loan after creation
- Archiving borrowers
