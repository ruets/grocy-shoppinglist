# Delivery 3 — Location for new products — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a setting « Emplacement des nouveaux produits » (e.g. « À ranger ») used for every product the app creates; the checkup warns when that location no longer exists.

**Architecture:** the choice is a per-phone setting stored with the others (SecureStore). `productPresets` takes it as a preferred location and falls back to the Grocy preset when it is unset or gone. The checkup gets the location list instead of a count and adds one row when a location is chosen.

**Tech Stack:** Expo SDK 58, TypeScript, Zustand, Jest (jest-expo), tsx integration script.

**Spec:** `docs/superpowers/specs/2026-11-26-shared-cart-local-products-design.md` (section 6).

## Global Constraints
- Unset → current behaviour (Grocy preset `product_presets_location_id`, else first location).
- Chosen location deleted in Grocy → product goes to the Grocy preset (never fails), and the checkup shows a **warning** (not blocking, no automatic fix).
- Nothing is written to Grocy for this setting.
- UI French; code, comments, tests, commits English.

## Review Focus
- Chosen location id no longer in Grocy → `productPresets` falls back (Task 1 test).
- Settings opened before « Tester la connexion » → locations come from the loaded data, the current choice stays selected (Task 3 UI check).
- Existing installs without the new key → `newProductLocationId: null` (Task 2, `loadSettings` default).
- Checkup when nothing is chosen → no extra row (Task 1 test).
- Server down → checkup still a single error row (existing test keeps passing).

---

### Task 1: presets and checkup (`src/api/grocy.ts`, `src/logic/checkup.ts`)

**Interfaces:**
- `productPresets(settings, locations, units, preferredLocationId: number | null = null)`: preferred id when it is in `locations`, else the current rule.
- `CheckupInput.locations: NamedEntity[]` (was a count) and `CheckupInput.newProductLocationId: number | null`.
- New `CheckResult` id `'newProductLocation'`, after `meta`: ok « Nouveaux produits : « X » »; gone → warning « Emplacement des nouveaux produits introuvable », detail « Les nouveaux produits iront dans l’emplacement par défaut de Grocy. Choisissez-en un autre dans les Réglages. »; unset → no row.
- [ ] **Step 1: Tests** in `src/api/__tests__/grocy.test.ts` (preferred used; preferred missing → preset; null → preset) and `src/logic/__tests__/checkup.test.ts` (ok row with the name; warning when gone, not blocking; no row when null).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.

### Task 2: settings and store

- `AppSettings.newProductLocationId: number | null`, SecureStore key `grocy_new_product_location_id`, deleted when null.
- `runCheckup` passes `locations` and `settings.newProductLocationId`; `createProduct` passes it to `productPresets`.
- [ ] **Step 1:** implement; `npx tsc --noEmit` clean apart from UI.

### Task 3: Settings UI (`src/screens/SettingsScreen.tsx`)

- Section « Emplacement des nouveaux produits » under the list: chips « Préréglage Grocy » + Grocy locations (A→Z), from `meta.locations`, refreshed by « Tester la connexion ». Hint: « Les produits créés depuis l’app y sont rangés, à déplacer ensuite dans Grocy. »
- [ ] **Step 1:** `npx tsc --noEmit`, `npx jest`, `npx expo lint` (no new errors).
- [ ] **Step 2: Commit** `feat: location for products created by the app` (Tasks 1–3).

### Task 4: integration script, README, simulator

- [ ] Script: `productPresets(…, locations[last].id)` returns that id; with an unknown id returns the preset.
- [ ] README: the setting.
- [ ] Simulator: choose a location, create a product from the add screen, check its `location_id` in Grocy, then delete that test product.
- [ ] **Commit** `test: preferred location against Grocy; docs: new-product location`.
