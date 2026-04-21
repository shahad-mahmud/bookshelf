# UI Polish — Design Spec

**Date:** 2026-04-21  
**Spec:** 1.7

---

## Goal

Make the app feel responsive and give users confirmation that their actions worked. Two targeted improvements: a navigation progress bar for route transitions, and success toasts for in-place actions.

---

## Changes

### 1. Navigation progress bar

**Package:** `nextjs-toploader`

**File:** `app/layout.tsx`

Install `nextjs-toploader` and render `<NextTopLoader />` as the first child of `<body>`, before `{children}`. It auto-hooks into Next.js App Router navigation events — no additional wiring needed.

Config:
- `color="#2299DD"` — default blue, visibly contrasts against the app's neutral black/white primary
- `showSpinner={false}` — suppress the spinner in the top-right corner (bar only)
- All other props use library defaults (height 3px, easing, shadow)

```tsx
import NextTopLoader from 'nextjs-toploader'

// inside <body>:
<NextTopLoader color="#2299DD" showSpinner={false} />
```

---

### 2. Success toasts on in-place actions

The Sonner `<Toaster />` is already registered in `app/layout.tsx`. Wire `toast.success()` into the existing `wasPendingRef` success effects in three components.

**Pattern:** In the `useEffect` that fires when `wasPendingRef.current && !pending && state.ok`, call `toast.success(message)` before or alongside the existing `router.refresh()` / `setOpen(false)`.

Import in each component:
```tsx
import { toast } from 'sonner'
```

#### `components/loan/lend-book-dialog.tsx`

In the wasPendingRef effect success branch:
```ts
toast.success('Book lent')
```

#### `components/loan/active-loan-card.tsx`

In the wasPendingRef effect success branch:
```ts
toast.success('Marked as returned')
```

#### `components/loan/active-loans-section.tsx` — `ReturnButton`

In the wasPendingRef effect success branch:
```ts
toast.success('Marked as returned')
```

---

## Out of Scope

- Skeleton / loading screens
- Error toasts (errors remain inline — they're already clear and field-adjacent)
- Toasts for redirect-based actions (delete book, create book, edit book — page navigates before toast renders)
- Optimistic updates
- Page transition animations
