# Best-before dates at checkout + barcode association — plan

> Execution: native (in session), on the user's go-ahead.

**Goal:** best-before date mandatory to check out (guided entry + scan), associate an unknown barcode with an existing product, remove Open Food Facts.
**Architecture:** pure logic in `src/logic/` (Jest-tested), UI in the existing modals; date entry becomes a phase of `CheckoutModal` (no extra modal, avoids iOS modal transitions).
**Spec:** `docs/superpowers/specs/2026-11-26-dates-et-codes-barres-design.md`

## Global Constraints
- « Ne périme pas » (never expires) = `2999-12-31`; displayed as « jamais ».
- Free-text lines are exempt from the date requirement.
- Checkout button disabled while a checked product has no date.

## Review Focus
- `1203` typed on 26/11 → next year (date has passed); `2611` on 26/11 → today (not next year).
- Product with `default_best_before_days` = -1 → « Ne périme pas » chip only; 0 → no default chip.
- Scanning, during date entry, a product that is not checked / unknown → message, no change.
- Line unchecked during date entry (refresh) → dropped from the walkthrough without crashing.
- Associating a barcode already linked to another product → Grocy error shown readably.

### Task 1: dates (`src/logic/dates.ts`)
- `parseUserDate`: accepts `DDMM`, `DDMMYY`, `DDMMYYYY`; without a year → current year, or next year if before today (same for `DD/MM`).
- `NEVER_EXPIRES = '2999-12-31'`, `formatBestBefore(iso) → 'jamais' | 'DD/MM/YYYY'`.
- `productDefaultBestBefore(days: number|null, today) → string|null` (-1 → NEVER_EXPIRES, >0 → today+days, otherwise null).
- Tests: `misc.test.ts` (Review Focus 1 and 2).

### Task 2: checkout logic (`src/logic/checkout.ts`)
- `linesMissingBestBefore(lines, getLocal) → ShoppingLine[]`: checked, with a product, without `bestBefore`.
- Tests: `checkout.test.ts`.

### Task 3: remove Open Food Facts
- Delete `externalBarcodeLookup`, `isInStoreBarcode`, their tests, and the OFF step in `ListScreen`.
- `Product.default_best_before_days: number | null` (normalized).

### Task 4: « Code inconnu » screen (`src/screens/UnknownBarcodeModal.tsx`, replaces `NewProductModal`)
- Suggestions: products of unchecked lines; then `ProductPicker` (search + create the product in Grocy).
- "Associate the barcode and continue" → store `addBarcode(productId, code)` → reloadProducts → `openForProduct`.

### Task 5: guided checkout (`CheckoutModal`)
- Phases `dates | recap | result`. On open: `dates` if `linesMissingBestBefore` is not empty.
- Dates phase: snapshot of missing ids, current index, counter, auto-focused field (Return = next), chips (never expires, product default, +3 days, +1 week, +1 month), Previous/Next, Scanner button (nested ScannerModal) → jumps to the product's checked line, otherwise a toast.
- Saved immediately via store `setBestBefore(lineId, iso|null)`.
- Recap: date per line, "N missing dates" banner → dates phase; checkout disabled while dates are missing.
- Shortcuts also in `PurchaseModal` (never expires, product default).

### Task 6: verification
- `npx tsc --noEmit`, `npx jest`, `npx expo export --platform ios`, `npm run test:api` against the Grocy instance.
