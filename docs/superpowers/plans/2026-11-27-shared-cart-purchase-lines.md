# Delivery 1 — Cart in Grocy userfields + Grocy Doctor + « Autre prix » — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** store price paid and best-before date in typed Grocy userfields on shopping-list lines (shared between phones), add a Grocy checkup that runs at startup and on demand and creates what the app owns, and let a product be bought at a second price as a second line.

**Architecture:** a pure checkup module turns Grocy data into a list of check results and fix actions; the API client gains userfield read/write and a merged refresh; the store reads `paid_price` / `best_before` from lines instead of AsyncStorage; `App.tsx` adds a checkup phase between init and the list.

**Tech Stack:** Expo SDK 58, TypeScript, Zustand, AsyncStorage, Jest (jest-expo), tsx integration script.

**Spec:** `docs/superpowers/specs/2026-11-26-shared-cart-local-products-design.md` (sections 1–3; 4–7 are later deliveries).

## Global Constraints
- Userfields on entity `shopping_list`, `show_as_column_in_tables` 0:
  - `appprix` caption « Prix payé (app) », type `number-decimal`
  - `appdlc` caption « DLC (app) », type `date`
  - `apprayon` caption « Rayon (app) », type `number-integral`
- Save = two requests: `PUT /objects/shopping_list/{id}` (`done`, `amount`, `note`), then `PUT /userfields/shopping_list/{id}` with only the changed keys; "not set" is sent as `''`.
- Refresh = `uihelper_shopping_list` + `shopping_list` (same encoded query) in parallel, merged by id.
- Empty / non-parsable userfield value → `null`, never throws.
- The checkup (« Grocy Doctor » in Settings) only **adds** (userfields, a shopping list « Liste de courses » when none exists) or selects an existing list, and **only after the user taps « Réparer »** on a screen listing exactly what will be done; never edits or deletes. Startup never fixes on its own.
- Grocy version < 4.0 and "no location / no quantity unit" are warnings, not blocking.
- v1.0.0 key `line_local_data_v1` removed at startup, not migrated; phone keeps only `stocked_lines_v1` (line id → timestamp, pruned after 7 days).
- UI French; code, comments, tests, commits English.

## Review Focus
- A userfield named `appprix` already exists with another type (user made it) → checkup error « type incorrect », startup blocked with explanation, nothing created or changed (test in Task 1).
- Userfields deleted in Grocy while the app runs → next save's userfield PUT fails → toast, line state still saved; « Relancer » in the checkup recreates them (test in Task 1: fixes list only missing fields).
- Server unreachable at startup → checkup screen shows « Serveur injoignable » with « Réglages » and « Relancer », no auto-fix attempted (test in Task 1).
- Selected shopping list deleted in Grocy → checkup « Liste introuvable », fix = select the first existing list; create « Liste de courses » only when there is none (test in Task 1).
- « ＋ Autre prix » when the first save fails → no second line created, error toast, modal stays on the first line (Task 4 simulator check).

---

### Task 1: checkup logic (`src/logic/checkup.ts`)

**Files:**
- Create: `src/logic/checkup.ts`, `src/logic/__tests__/checkup.test.ts`

**Interfaces:**
- Produces:
  - `const APP_USERFIELDS: { name: string; caption: string; type: string }[]` (Global Constraints values)
  - `type CheckStatus = 'ok' | 'warning' | 'missing' | 'error'`
  - `interface CheckResult { id: 'server' | 'version' | 'list' | 'userfields' | 'meta'; status: CheckStatus; label: string; detail?: string; fix?: Fix }`
  - `type Fix = { kind: 'createUserfields'; fields: typeof APP_USERFIELDS } | { kind: 'createList' } | { kind: 'selectList'; listId: number } | { kind: 'openSettings' }`
  - `interface CheckupInput { server: { ok: true; version: string } | { ok: false; error: GrocyError }; lists: NamedEntity[]; selectedListId: number | null; userfields: { entity: string; name: string; type: string }[]; locations: number; units: number }`
  - `evaluateCheckup(input: CheckupInput): CheckResult[]` — when `server.ok` is false only the `server` result is returned (fix `openSettings`).
  - `isBlocking(results: CheckResult[]): boolean` — any `missing` or `error`.
  - `pendingFixes(results): Fix[]` — fixes offered behind « Réparer » (`createUserfields`, `createList`, `selectList`).
  - `describeFix(fix: Fix): string` — French sentence shown before confirming (e.g. « Créer les champs Prix payé (app), DLC (app) »).
- [ ] **Step 1: Tests** — all ok; version `3.3.2` → warning; no list → `missing` + `createList`; selected list gone, others exist → `missing` + `selectList` first id; one field missing → `createUserfields` with that field only; `appprix` with type `text-single-line` → `error`, no fix, and not in `pendingFixes`; `describeFix` for each fix kind; userfield of same name on another entity ignored; 0 locations → warning; server down (`kind: 'network'`) → single `error` result with `openSettings`; auth error → label « Clé API refusée ».
- [ ] **Step 2: Run** `npx jest src/logic/__tests__/checkup.test.ts` — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat: add Grocy checkup logic`

### Task 2: API client (`src/api/grocy.ts`)

**Files:**
- Modify: `src/api/grocy.ts`, `src/api/__tests__/grocy.test.ts`

**Interfaces:**
- Consumes: `APP_USERFIELDS` (Task 1).
- Produces:
  - `ShoppingLine` gains `paid_price: number | null`, `best_before: string | null` (`YYYY-MM-DD` only), `aisle_id: number | null`.
  - `getUserfields(): Promise<{ id: number; entity: string; name: string; type: string }[]>`
  - `createUserfield(f: { name; caption; type }): Promise<number>` (entity `shopping_list`, `show_as_column_in_tables: 0`)
  - `createShoppingList(name: string): Promise<number>`
  - `getShoppingLines(listId)` — parallel fetch + merge (Global Constraints).
  - `setLineFields(lineId: number, v: { paidPrice?: number | null; bestBefore?: string | null; aisleId?: number | null }): Promise<void>` — maps to `appprix` / `appdlc` / `apprayon`, null → `''`.
- [ ] **Step 1: Tests** (fetch mock): merge puts values on the right line; `'abc'` price → null; `'2026-12-03 00:00:00'` → `'2026-12-03'`; a line absent from `shopping_list` gets nulls; `setLineFields({ paidPrice: 1.5 })` sends `{"appprix":"1.5"}` only; `createUserfield` body.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat: read and write shopping line userfields`

### Task 3: store, totals, checkout on line fields

**Files:**
- Modify: `src/store/useStore.ts`, `src/storage/local.ts`, `src/logic/checkout.ts`, `src/logic/__tests__/checkout.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:
  - storage: `loadStocked()`, `saveStocked(map)`, `pruneStocked(map, now)`, `clearLegacyLineData()`; `loadLineData` / `saveLineData` / `pruneLineData` removed.
  - checkout: `LineLocalData` removed; `linesMissingBestBefore(lines)` reads `line.best_before`; `CheckoutDeps { client; isStocked(lineId): boolean; markStocked(lineId): Promise<void>; onProgress? }`; purchase uses `line.paid_price` / `line.best_before`.
  - store state: `local` → `stocked`; `checkup: CheckResult[] | null`; `phase: 'init' | 'checking' | 'checkupBlocked' | 'ready'` (replaces `ready`).
  - store actions: `runCheckup(): Promise<CheckResult[]>` (loads inputs, evaluates, never fixes), `applyFixes(fixes: Fix[])` (then re-runs the checkup); `markPurchased(lineId, { amount, unitPrice, bestBefore })` → line PUT then `setLineFields`; `unmark` clears both fields; `setBestBefore(lineId, iso)` → `setLineFields`; `addPriceLine(lineId, { amount, unitPrice, bestBefore }): Promise<number>` — new checked line, same product/qu, then its fields; returns new id. `purchaseOffList` writes fields after creating the line.
  - `init`: settings → `checking` → `runCheckup()` → `ready` (nothing blocking) or `checkupBlocked`; `clearLegacyLineData()`.
- [ ] **Step 1: Tests**: checkout tests rewritten on `paid_price` / `best_before` / `isStocked`; `linesMissingBestBefore` on line fields. **Step 2:** `npx jest` — PASS; `npx tsc --noEmit` errors only in UI files.
- [ ] **Step 3: Commit** together with Task 4.

### Task 4: UI

**Files:**
- Create: `src/screens/CheckupScreen.tsx`
- Modify: `App.tsx`, `src/screens/SettingsScreen.tsx`, `src/screens/ListScreen.tsx`, `src/components/LineRow.tsx`, `src/screens/PurchaseModal.tsx`, `src/screens/CheckoutModal.tsx`

**Interfaces:**
- Consumes: Task 3 state/actions.
- Changes:
  - `App.tsx`: `phase === 'checking'` → spinner « Vérification de Grocy… »; `checkupBlocked` → `CheckupScreen` (blocking mode); `ready` → list.
  - `CheckupScreen` (title « Vérification de Grocy »): one row per `CheckResult` (icon ✓ / ⚠ / ✕, label, detail); a « Ce qui sera fait » box listing `describeFix` of `pendingFixes`; « Réparer » applies them only on tap; « Relancer », « Réglages »; in blocking mode « Continuer » appears once nothing blocks.
  - `SettingsScreen`: « Grocy Doctor » button opening `CheckupScreen` (non-blocking mode).
  - `ListScreen` / `LineRow` / `CheckoutModal`: read `line.paid_price` / `line.best_before` instead of `local[...]`.
  - `PurchaseModal`: « ＋ Autre prix » → `markPurchased` current line, then `addPriceLine` (qty 1, same price), modal switches to the new line; hidden for free-text lines.
- [ ] **Step 1:** `npx tsc --noEmit`, `npx jest`, `npx expo lint` — PASS.
- [ ] **Step 2: Simulator check** (Expo Go, user's Grocy): fresh start shows the Doctor listing the 3 fields to create, nothing created before « Réparer », then fields visible in Grocy and the list opens; price/date entered → visible in Grocy's web UI on the line; value changed in Grocy → shown after refresh; « Autre prix » → two Bonbons lines, totals right; field deleted in Grocy → checkup in Settings shows it missing, « Réparer » recreates it; wrong API key → blocking checkup screen; checkout → stock entries with their prices/dates, lines deleted.
- [ ] **Step 3: Commit** `feat: store cart in Grocy userfields, add Grocy checkup and second price` (Tasks 3 + 4).

### Task 5: integration script + docs

**Files:**
- Modify: `scripts/api-integration-test.ts`, `README.md`

- [ ] **Step 1:** script steps: `evaluateCheckup` on live data, apply `pendingFixes`, re-run → no fix left (idempotent); checked line + `setLineFields` → `getShoppingLines` returns them → `runCheckout` → stock entry with exact price/date, line deleted; cleanup as today. Fields are kept.
- [ ] **Step 2: Run** `npm run test:api` (`GROCY_URL`, `GROCY_API_KEY` env vars; key never written to disk) — all OK.
- [ ] **Step 3:** README: "Data stored in Grocy" (the 3 fields, what stays on the phone, v1.0.0 local prices not migrated) and "Grocy Doctor".
- [ ] **Step 4:** `npx expo lint`, `npx tsc --noEmit`, `npx jest`.
- [ ] **Step 5: Commit** `test: checkup and userfields against Grocy; docs`
