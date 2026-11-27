# Delivery 2 — Off-stock items + add screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** make free-text items first-class "off-stock items" (name, optional aisle, quantity, price counted in the cart) and rework the add screen so existing products are visible without typing.

**Architecture:** pure helpers decide grouping (`groupLines` with aisle names) and picker sections (`pickerSections`); the store writes the « Rayon (app) » userfield (`apprayon`, created in delivery 1) for off-stock lines; the item editor gets two modes (Grocy product / hors stock); the purchase modal treats off-stock lines like products, without the date block.

**Tech Stack:** Expo SDK 58, TypeScript, Zustand, Jest (jest-expo), tsx integration script.

**Spec:** `docs/superpowers/specs/2026-11-26-shared-cart-local-products-design.md` (sections 4 and 5).

## Global Constraints
- Off-stock item = shopping line with `product_id = null`; its name is the `note`; aisle = userfield `apprayon` (product group id) or empty.
- Section order on the list: product groups A→Z (Grocy products **and** off-stock items with that aisle), then « Sans rayon », then « Texte libre » (off-stock items without aisle) last.
- Off-stock items: quantity and price like products, unit label « unité(s) », counted in all totals; no best-before date anywhere (not asked in the purchase modal, never required at checkout); at checkout the line is deleted, no stock.
- Add screen: empty search → all active Grocy products grouped by product group (A→Z, « Sans rayon » last); with a query → the existing accent-insensitive search; name not found → two buttons « Créer dans Grocy » and « Ajouter hors stock ». The hidden « Texte libre » field is removed.
- « ＋ Autre prix » stays for Grocy products only.
- UI French; code, comments, tests, commits English.

## Review Focus
- Off-stock line whose aisle id no longer exists in Grocy (group deleted) → shown under « Texte libre », no crash (test in Task 1).
- Existing free-text lines from before (no `apprayon`) → « Texte libre » section, editable, priced like the rest (test in Task 1).
- Off-stock name with only spaces → « Ajouter » disabled (Task 4 UI check).
- Editing an off-stock line's aisle to « Aucun » → `apprayon` cleared in Grocy (Task 3 test of the store payload via `setLineFields` call, Task 5 integration).
- Product search typed then cleared → grouped list reappears (Task 2 test).

---

### Task 1: grouping with off-stock aisles (`src/logic/grouping.ts`)

**Files:** Modify `src/logic/grouping.ts`, test in `src/logic/__tests__/misc.test.ts`

**Interfaces:**
- Produces: `groupLines(lines: ShoppingLine[], aisleNames: Map<number, string>): LineSection[]`
- [ ] **Step 1: Tests**: off-stock line with `aisle_id` 3 (« Frais ») lands in « Frais » next to products of that group; off-stock without aisle → « Texte libre » last; aisle id 99 unknown → « Texte libre »; existing ordering tests still pass (unchecked first, then name).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat: group off-stock items by their aisle`

### Task 2: picker sections (`src/logic/picker.ts`)

**Files:** Create `src/logic/picker.ts`, `src/logic/__tests__/picker.test.ts`

**Interfaces:**
- Produces: `pickerSections(products: Product[], query: string, groups: NamedEntity[]): { title: string | null; data: Product[] }[]` — empty/blank query → one section per product group (A→Z by group name, products A→Z), then « Sans rayon »; non-empty → one section `title: null` with `searchByName(products, query, 30)`.
- [ ] **Step 1: Tests**: grouping and order; blank query `'  '` behaves like empty; query returns one untitled section; empty product list → `[]`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat: picker sections for the add screen`

### Task 3: store (`src/store/useStore.ts`)

**Interfaces:**
- Changes: `addItem` / `updateItem` payload becomes `{ productId: number | null; amount: number; note: string; aisleId?: number | null }`; for `productId === null`, after the line write, `setLineFields(id, { aisleId })` (null clears). `addShoppingLine` already returns the id.
- `aisleNames` derived from `meta.productGroups` (exported selector helper `aisleNameMap(meta)`).
- [ ] **Step 1:** implement; `npx tsc --noEmit` errors only in UI files; `npx jest` PASS.
- [ ] **Step 2: Commit** with Task 4.

### Task 4: UI

**Files:** Modify `src/components/ProductPicker.tsx`, `src/screens/ItemEditorModal.tsx`, `src/screens/PurchaseModal.tsx`, `src/components/LineRow.tsx`, `src/screens/ListScreen.tsx`

- `ProductPicker`: renders `pickerSections` (section labels); when the query matches no exact name: « ＋ Créer « X » dans Grocy » and « ＋ Ajouter « X » hors stock » (new prop `onOffStock(name)`); `allowFreeText` hint removed.
- `ItemEditorModal`: mode `product | offStock`. Off-stock mode: « Nom » field (required, trimmed), « Rayon » chips (« Aucun » + product groups), quantity stepper (unit « unité(s) »), « Changer » goes back to product search. Editing a free-text line opens in off-stock mode with its note and `aisle_id`.
- `PurchaseModal`: off-stock lines get quantity + unit price ↔ total (unit « unité »), no date block, no « Autre prix »; saves via `markPurchased` with `bestBefore: null`.
- `LineRow`: off-stock shows quantity (when ≠ 1) and price like products; no « sans prix » label when it has none (keep current blank).
- `ListScreen`: `groupLines(lines, aisleNameMap(meta))`.
- [ ] **Step 1:** `npx tsc --noEmit`, `npx jest` — PASS.
- [ ] **Step 2: Commit** `feat: off-stock items with aisle and price, add screen shows existing products` (Tasks 3 + 4).

### Task 5: integration script + README

- [ ] **Step 1:** script: free-text line + `setLineFields({ aisleId: <first group or skip> })` → read back `aisle_id`; then `setLineFields({ aisleId: null })` → `null`; checkout deletes it without stock (already covered).
- [ ] **Step 2:** `npm run test:api` — all OK.
- [ ] **Step 3:** README Usage: off-stock items, add screen.
- [ ] **Step 4: Commit** `test: off-stock aisle against Grocy; docs: off-stock items`
- [ ] **Step 5: Simulator check** (user's Grocy, no checkout of the user's own lines): empty search shows grouped products; « Ajouter hors stock » with aisle → line in that aisle; price counted in totals; edit aisle to « Aucun » → « Texte libre »; purchase modal has no date block.
