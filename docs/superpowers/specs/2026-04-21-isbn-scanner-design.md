# ISBN Barcode Scanner — Design Spec

**Date:** 2026-04-21  
**Spec:** 1.8

---

## Goal

Let users add books by pointing their phone camera at the barcode instead of typing the ISBN. The scanner is mobile-only and integrates with the existing ISBN lookup flow — no extra steps once a barcode is detected.

---

## Changes

### 1. Prerequisites

**`next.config.ts` line 71** — change `camera=()` to `camera=(self)`:

```
"Permissions-Policy": "camera=(self), microphone=(), geolocation=(), payment=()"
```

`camera=(self)` allows camera access from the app's own origin. Currently `camera=()` blocks it entirely.

**Install `@zxing/browser`:**

```bash
npm install @zxing/browser
```

No API key required. Decodes EAN-13 barcodes (the format used on books) from a live camera stream entirely in-browser.

---

### 2. `BarcodeScannerOverlay` component

**File:** `components/book/barcode-scanner-overlay.tsx`  
**Type:** `'use client'`

**Props:**
```ts
{
  onDetected: (isbn: string) => void
  onClose: () => void
}
```

**Behaviour:**

On mount:
1. Request camera access via `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })` — `environment` selects the rear camera on phones.
2. Attach the stream to a `<video>` element and start playing.
3. Start `BrowserMultiFormatReader` from `@zxing/browser` scanning the video element continuously.
4. On first barcode detected: call `onDetected(isbn)` and stop the reader + stream.

On unmount (cleanup): always stop the reader and release the stream, regardless of whether a barcode was detected.

On camera permission denied or any `getUserMedia` error: show an error message inline instead of the viewfinder. Error message: `"Camera access denied. Please allow camera access in your browser settings."`

**UI:**

Full-screen overlay (`fixed inset-0 z-50 bg-black`):
- `<video>` element fills the screen (`w-full h-full object-cover`)
- Centered semi-transparent aim rectangle (`absolute` positioned, ~240×240px, `border-2 border-white rounded-lg`) to show the user where to aim
- Close button (`×`) in the top-right corner (`absolute top-4 right-4`) — calls `onClose()`
- "Point camera at barcode" hint text above the aim rectangle

---

### 3. Integration with `IsbnLookup`

**File:** `components/book/isbn-lookup.tsx`

**Changes:**
- Add `scannerOpen` boolean state (default `false`)
- Add a camera icon button (`md:hidden`) to the right of the existing "Look up" button. Uses `Camera` from `lucide-react`. Disabled when `pending`.
- When camera button clicked: `setScannerOpen(true)`
- Render `{scannerOpen && <BarcodeScannerOverlay ... />}` below the input row
- `onDetected`: set `isbn` state to detected value, call `lookup(detected)` immediately, `setScannerOpen(false)`
- `onClose`: `setScannerOpen(false)`

The typed-ISBN flow (`onBlur` + "Look up" button) is completely unchanged.

**Updated JSX structure (button row):**
```tsx
<div className="flex gap-2">
  <Input ... />
  <Button type="button" variant="outline" size="sm" ...>
    {pending ? 'Looking up…' : 'Look up'}
  </Button>
  <Button
    type="button"
    variant="outline"
    size="sm"
    className="md:hidden"
    disabled={pending}
    onClick={() => setScannerOpen(true)}
    aria-label="Scan barcode"
  >
    <Camera className="h-4 w-4" />
  </Button>
</div>
{scannerOpen && (
  <BarcodeScannerOverlay
    onDetected={(detected) => {
      setIsbn(detected)
      lookup(detected)
      setScannerOpen(false)
    }}
    onClose={() => setScannerOpen(false)}
  />
)}
```

---

## Out of Scope

- QR code scanning
- Desktop camera scanning (scan button is `md:hidden`)
- Scanning from an image file (camera stream only)
- Multiple barcode formats beyond EAN-13/ISBN
- Torch/flashlight control
