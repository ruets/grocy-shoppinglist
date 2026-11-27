# Shared cart in Grocy userfields, Grocy checkup, off-stock items, i18n

## Why
- Grocy should act as the **central server**: cart state (checked, price paid, best-before date) must be shared between phones and survive a reinstall, instead of living in each phone's AsyncStorage.
- One product bought at two prices (sweets, two cheese sizes) must be possible.
- The app depends on things that must exist in Grocy (custom fields, a shopping list…): the user wants a **checkup** that verifies them and adds what is missing through the API, at startup and on demand.
- Free-text items exist but are hidden and too limited: the user wants **off-stock items** (never in Grocy's products/stock) sorted by aisle, with prices counted in the cart.
- Products created from the app should land in a **"to put away" location**, fixed later in Grocy.
- The add screen should show existing products, not only search results.
- The UI should be translatable (French + English).

## Goals / non-goals / anti-goals
- Goal: price paid and best-before date stored in typed Grocy **userfields** on shopping-list lines, readable by every phone.
- Goal: two prices for one product = **two shopping-list lines** of that product.
- Goal: a checkup screen (« Grocy Doctor ») + a startup check; fixes only after the user confirms.
- Goal: off-stock items with an optional aisle, created from the add screen.
- Goal: the add screen shows existing Grocy products grouped by aisle when the search is empty.
- Non-goal: several purchase lines inside one shopping-list line (dropped: JSON in a field, unreadable in other Grocy apps).
- Non-goal: a catalog of off-stock items — they exist only while on the list.
- Non-goal: migrating prices/dates saved locally by v1.0.0 — start from zero.
- Non-goal: real-time conflict resolution between phones (last write wins).
- Anti-goal: the checkup changing or deleting anything the user made (it only adds).
- Anti-goal: a stock entry created twice for the same line.

## Approaches considered
- A. Keep cart state in AsyncStorage (current) — no sharing, lost on reinstall.
- B. JSON in the shopping-line `note` — the note stops being a note, clutters Grocy's UI.
- C. One JSON userfield with several purchase lines per item — works, but needs a codec, tolerance to broken values, synthetic ids, a multi-line purchase modal; other Grocy apps (Grocy Android, Grocy Mobile) don't show shopping-list userfields anyway.
- **Chosen (user): D. Typed userfields, one purchase per line** — a decimal and a date field, readable and editable in Grocy's web UI; a second price = a second line.
- Catalog of off-stock items: dropped (user's call).

## Verified on the user's Grocy 4.7.1 (2026-11-27, test objects deleted afterwards)
- `POST /objects/userfields` (entity `shopping_list`) works with the user's API key → the app can create its fields.
- `objects/uihelper_shopping_list` (used today) does **not** include userfields, but carries `product_name`, `last_price_unit`, `product_group_id`, `qu_name`; `objects/shopping_list` returns `"userfields":{…}` inline → refresh = both requests in parallel, merged by line id.
- `PUT /objects/shopping_list/{id}` with a `userfields` key fails (`no such column: userfields_id`) → a save is **two requests**: the line, then `PUT /userfields/shopping_list/{id}` (204).
- Updating a line through `/objects/shopping_list/{id}` leaves its userfields untouched.
- The API accepts `-` in userfield names; the app uses lowercase letters only.

## Design

### 1. Userfields on shopping-list lines
- Entity `shopping_list`, not shown as table columns:
  - `appprix` — « Prix payé (app) », `number-decimal`: price paid per stock unit.
  - `appdlc` — « DLC (app) », `date`: best-before date (`2999-12-31` = never expires).
  - `apprayon` — « Rayon (app) », `number-integral`: product group id, for off-stock items (used from delivery 2; created now so the checkup is complete).
- The `note` stays a plain note (user note for a product, item name for free text).
- Checked state stays Grocy's `done`.
- Tolerance: an empty or non-parsable value is read as "not set".
- Concurrency: last write wins; the 20 s auto refresh keeps phones close.
- Phone-local data shrinks to the "already stocked" marker per line (idempotent checkout). Old v1.0.0 local data is removed at startup.

### 2. Two prices for one product
- Purchase modal: unchanged (quantity, unit price ↔ total, optional date, shortcuts), plus « ＋ Autre prix »: saves the current line, then creates a **new checked line** of the same product, quantity 1, price prefilled from the current one, and switches the modal to it.
- Scanning a product already in the cart: opens its line with +1, as today.
- Totals, mandatory dates and the guided walkthrough work per line, as today; checkout unchanged (one stock entry per line, line deleted afterwards).

### 3. Grocy checkup (« Grocy Doctor »)
- Only the Settings **button** is named **« Grocy Doctor »** (user's choice); the screen title is « Vérification de Grocy », the startup step reads « Vérification de Grocy… ».
- One list of checks, each `ok | missing | error`, with a short French label and, when it fails, what to do:
  1. Server reachable and API key valid (`GET /system/info`) — not fixable by the app → go to Settings.
  2. Grocy version ≥ 4.0 — warning only.
  3. The selected shopping list exists (at least one list) — fixable: create « Liste de courses ».
  4. Userfields `appprix`, `appdlc`, `apprayon` exist on `shopping_list` — fixable: create them.
  5. A field with the app's name but the wrong type — error, not fixable (would lose data): explain to fix or delete it in Grocy.
  6. At least one location and one quantity unit (needed to create products) — warning, not fixed by the app.
- **Startup:** before the list screen, a short « Vérification de Grocy… » step runs the checks. All ok (warnings allowed) → list. Otherwise the « Vérification de Grocy » screen opens; **nothing is changed without asking**: it lists exactly what it would do (« Créer les champs Prix payé (app), DLC (app) », « Créer la liste « Liste de courses » », « Utiliser la liste « X » ») and waits for « Réparer ». Until then the list is not shown (the app cannot save without the fields); « Réglages » stays available.
- **On demand:** the « Grocy Doctor » button in Settings opens the same screen, which shows every check with its status, « Réparer » (same confirmation) and « Relancer ».
- The Doctor only **adds** (or selects an existing list, after asking); it never edits or deletes anything in Grocy.

### 4. Off-stock items (delivery 2)
- Off-stock item = free-text line (name in the note) with optional « Rayon (app) », grouped under its aisle (or « Articles hors stock » without one). « ＋ Autre prix » works for it too (same name and aisle, no date), and it shows « sans prix » like a product when it has no price.
- Price and quantity as for products; counted in the totals.
- At checkout its line is deleted, no stock. Nothing is kept afterwards.

### 5. Add screen (delivery 2)
- Empty search: all Grocy products grouped by aisle.
- Accent-insensitive search.
- Name not found: « Créer dans Grocy » and « Ajouter hors stock » (the latter asks for the aisle, optional).
- The hidden "texte libre" field is removed.

### 6. Location for new products (delivery 3)
- Setting « Emplacement des nouveaux produits », picked among Grocy locations (e.g. « À ranger »); the checkup warns if the chosen location no longer exists.
- Used for every product the app creates. Unset → current behaviour (Grocy preset).

### 7. Internationalisation (delivery 4)
- All UI strings in translation files, French + English; follows the phone language, French fallback.
- Number, price and date formats follow the language; date input keeps the current shortcuts.
- Userfield captions stored in Grocy are fixed whatever the language.

## Unchanged
Scanning, unknown barcode → associate/create, guided dates at checkout, 20 s auto refresh, Expo Go only, no new native dependency.

## Delivery order
1. Userfields (price, date) + checkup + « Autre prix ».
2. Off-stock items + add screen.
3. Location for new products.
4. Internationalisation.
Each delivery: tsc, Jest, integration script against the user's Grocy, simulator check, its own commit.

## Left to the builder
- Screen layout, secondary labels.
- i18n library choice (prefer `expo-localization` + a light JS lib, no native module beyond Expo Go).
