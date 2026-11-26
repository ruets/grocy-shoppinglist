# Best-before dates at checkout + barcode association

## Why
- Entering the best-before date for every item while shopping is tedious: it must stay **optional while shopping**, editable at any time, but **mandatory to check out** the list (every checked product needs a date).
- The Open Food Facts lookup creates wrong products (in-store codes starting with 2) → **removed**.
- An unknown barcode often belongs to a product that **already exists** in Grocy (or is on the list): it must be possible to **associate the barcode** with that product, not only to create a new one.

## Goals / non-goals
- Goal: never check out a checked product without a date; fast one-handed entry.
- Goal: unknown barcode → associate it with an existing product or create one.
- Non-goal: editing stock entries *after* checkout (dates are entered before).
- Anti-goal: blocking checking items off in store because of a date.

## Approaches considered
- A. Date field on every line of the checkout summary — simple, but the keyboard keeps opening/closing and the list gets long.
- B. **Guided walkthrough** of the products missing a date, one at a time.
- C. Scan the product to open its date.
- **Chosen: B + C combined** — the guided walkthrough proposes the products without a date in order, and a « Scanner » button jumps straight to the product in hand.

## Design
### Dates
- Purchase modal: unchanged (date optional), plus the new shortcuts below.
- « Valider (n) »: if checked **products** are missing a date (free text excluded), first open the **« Dates de péremption »** screen:
  - "2 / 5" counter, product name in large type, amount;
  - auto-focused date field, numeric keyboard, Return = next;
  - chips: **« Ne périme pas »** (never expires = `2999-12-31`, Grocy convention), **« Défaut produit (+N j) »** (product default) when the product has `default_best_before_days > 0` (fills in the computed date, so it is explicit), +3 days, +1 week, +1 month;
  - Previous / Next; **« Scanner »** button: the scanned code jumps to the matching checked line (amount unchanged); a product that is not checked / unknown → message;
  - at the end → checkout summary.
- Summary: each line shows its date (« jamais » for 2999-12-31); if some are missing, an "N missing dates" banner restarts the walkthrough; the checkout button is disabled while dates are missing.
- Quick entry: `1203` → 12/03 (current year, or next year if the date has passed), `120327` → 12/03/2027, plus the existing formats.
- Dates are saved locally (as before) as they are typed: leaving the screen loses nothing.

### Barcodes
- Remove the Open Food Facts lookup (client, screen, tests) and the "codes starting with 2" rule.
- Unknown barcode → **« Code inconnu »** screen:
  - at the top, products of **unchecked** list lines (most likely matches);
  - Grocy product search (same accent-insensitive search);
  - pick a product → "associate the barcode with this product" (`POST /objects/product_barcodes`) → continue with the purchase modal (usual scan rules);
  - "create a new product" → name form → product + barcode creation → purchase modal.

## Left to the builder
- Exact screen layout, secondary labels.
- If the product default is 0 days or -1 ("never"), hide the chip (or treat -1 as « Ne périme pas »).
