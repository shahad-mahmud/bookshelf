# Mobile UX — Design Spec

**Date:** 2026-04-21  
**Spec:** 1.6

---

## Goal

Make the app smooth and comfortable for primary mobile use, with data entry as a first-class concern and a clear hook for future ISBN scanning. Desktop experience is unchanged.

The breakpoint for all mobile-specific behaviour is **below `md:` (< 768px)**. Above that, everything is as-is.

---

## Changes

### 1. Navigation — bottom nav + simplified header

**New component: `components/bottom-nav.tsx`**

A `'use client'` component. Fixed to the bottom of the viewport, `md:hidden`. Contains three destinations with icon + label:

| Label | Icon | Route |
|---|---|---|
| Home | House | `/` |
| Books | BookOpen | `/books` |
| Borrowers | Users | `/borrowers` |

Active state: the item whose route matches the current pathname gets a highlighted colour (`text-primary`). Use `usePathname()` to determine active item. `/books` is active for any path starting with `/books`; `/borrowers` for any starting with `/borrowers`; `/` only for exact match.

Height: `h-14` (56px). Each item is a full-height `<Link>` with `flex flex-col items-center justify-center gap-0.5 flex-1`. Icons from `lucide-react` at size 20.

The component is rendered in `app/layout.tsx` inside the existing `<body>`, below `{children}`. It is only visible when the user is authenticated — gate it the same way the header is gated (rendered from within the authenticated layout, not the root layout). Actually: since all authenticated pages include `<AppHeader>`, add `<BottomNav />` in `app/layout.tsx` unconditionally — it self-hides on desktop via `md:hidden`. Login/unauthenticated pages don't show bottom nav since they lack the fixed-bottom styling context anyway (no `pb-16` on their body).

**`app/layout.tsx`:** Add `<BottomNav />` just before `</body>`. Add `pb-16 md:pb-0` to the `<body>` element so content is never hidden behind the bar.

**`components/app-header.tsx`:** On mobile, hide the user name + email block (`hidden md:block` on the `<div>` wrapping name/email). The logout button stays visible on all sizes.

---

### 2. Add Book FAB

**`app/books/page.tsx`**

Below the existing page content (after the closing `</main>` tag, still inside the page return), add a fixed "+" button:

```tsx
<Link
  href="/books/new"
  className="fixed bottom-20 right-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg md:hidden"
  aria-label="Add book"
>
  <Plus className="h-6 w-6" />
</Link>
```

`bottom-20` (80px) clears the 56px bottom nav bar with a comfortable gap. The existing "Add book" `<Button>` in the page header stays — it is already `md:block`-equivalent since it was always there. No change needed to the desktop button.

---

### 3. Tap target & layout fixes

**`components/book/book-filters.tsx`**

`SelectTrigger` class: change `"w-36"` → `"w-full sm:w-36"`.

**`app/books/[id]/page.tsx`**

Back link (line ~90): add `py-2 inline-block` to the `<Link className>`.

Cover + metadata wrapper (line ~94): change `"flex gap-6"` → `"flex flex-col gap-6 sm:flex-row"`.

**`app/borrowers/[id]/page.tsx`**

Back link (line ~63): add `py-2 inline-block` to the `<Link className>`.

---

## Out of Scope

- PWA manifest / service worker / offline support
- ISBN camera scanning (future spec)
- Account / profile page
- Any changes to desktop layout
