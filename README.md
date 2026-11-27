# Courses Grocy

Mobile shopping list (Expo / React Native, TypeScript) connected to a **Grocy 4.7.x** instance.
Runs in **Expo Go** (iPhone / Android) with no native build. The app UI is in French, with big buttons and automatic dark mode.

## Getting started

```bash
npm install
npx expo start
```

Scan the QR code with **Expo Go** (Android) or the Camera app (iPhone). The phone must reach the dev machine (same Wi-Fi), or use `npx expo start --tunnel`.

## Grocy API key

In Grocy: user menu (top right) → **Manage API keys** → **Add**. Copy the key, then in the app: **Réglages** (settings) → URL (e.g. `https://grocy.home.lan`, without `/api`) + key → **Tester la connexion** (test connection) → pick the list → **Enregistrer** (save).

Optional: **Emplacement des nouveaux produits** (location for new products), e.g. a « À ranger » location in Grocy. Every product created from the app (add screen, unknown barcode) goes there, to be moved later in Grocy. « Préréglage Grocy » keeps Grocy's own default (Settings → Product presets). If the chosen location is deleted in Grocy, products go to the default again and the checkup shows a warning.
The URL and key are stored in the device keychain via `expo-secure-store`.

## HTTP vs HTTPS (iOS)

Expo Go allows plain HTTP, but a "real" iOS app (EAS/standalone build) blocks HTTP through **App Transport Security**. Use **HTTPS**; with Caddy, a block like

```
grocy.home.lan {
    tls internal        # or a real certificate (DNS challenge)
    reverse_proxy 127.0.0.1:9283
}
```

is enough (with `tls internal`, install Caddy's local CA on the phone). Works on the LAN as well as over WireGuard.

## Usage

- **Checkbox** on the left of an item → purchase modal: amount, unit price ↔ line total (linked both ways; the highlighted field is the one kept when the amount changes), optional best-before date. « Retirer du panier » unchecks it. « ＋ Autre prix » saves the line and adds a second checked line of the same item (e.g. two packs at different prices); for a Grocy product each line becomes its own stock entry, an off-stock item keeps its name and aisle.
- **+ Ajouter**: with an empty search, every Grocy product is listed by aisle; type to search (accent-insensitive). A name not found → « Créer dans Grocy » (new product) or « Ajouter hors stock ».
- **Off-stock items** (« hors stock »): items that never go to Grocy's stock (sweets, flowers…). They are free-text lines on the Grocy list (name in the note) with an optional aisle stored in « Rayon (app) », a quantity and a price counted in the totals, no best-before date; checkout just deletes them.
- **Item name** → edit / delete (product, or off-stock name / aisle / quantity).
- **Scanner**: EAN-13/8, UPC-A/E, Code128, with manual entry as a fallback. Unknown barcode → associate it with an existing product (list items first) or create a new product.
- **Valider** (checkout): every checked product needs a best-before date. Missing dates are collected in a guided step (quick entry `1203` = 12/03, « Ne périme pas » = never expires, scan to jump to a product). Then each checked item is added to stock (amount, price, best-before date, store) and its line is deleted; free-text lines are just deleted.
- Header totals: **Panier** (cart: entered prices, otherwise estimate), **Reste** (remaining: last price), **Liste** (list). `~` = estimate, `—` = no price known.

### Data stored in Grocy

The cart is shared between phones through Grocy. On each shopping-list line, the app uses three custom fields (userfields, entity `shopping_list`), visible and editable in Grocy's web UI:

| Name | Caption | Type | Content |
|------|---------|------|---------|
| `appprix` | Prix payé (app) | number-decimal | price paid per stock unit |
| `appdlc` | DLC (app) | date | best-before date (`2999-12-31` = never expires) |
| `apprayon` | Rayon (app) | number-integral | product group id of an off-stock item (its aisle on the list) |

A line is saved in two requests (the line, then `PUT /userfields/shopping_list/{id}`), and the list is read from `uihelper_shopping_list` and `shopping_list` in parallel. Empty or invalid values are read as "not set". Last write wins between phones; the 20 s auto refresh keeps them close.

The phone only keeps a per-line "already stocked" marker (AsyncStorage, 7 days) so an item is never added to stock twice if deleting its line failed. Prices and dates saved locally by v1.0.0 are not migrated.

### Grocy checkup (« Grocy Doctor »)

At startup the app checks Grocy (server and API key, version, selected shopping list, the three fields above, locations and units, the location for new products). If something is missing it shows « Vérification de Grocy » with the exact list of what it would do, and changes nothing until « Réparer » is tapped. It only adds (fields, a « Liste de courses » list when there is none) or selects an existing list; it never edits or deletes anything in Grocy. A field with the app's name but another type is reported, to be fixed by hand. The « Grocy Doctor » button in Settings opens the same screen at any time.

## Development

In the iOS simulator (no copy-paste), settings can be prefilled on first launch, **in development only**:

```bash
EXPO_PUBLIC_GROCY_URL=https://grocy.example.com EXPO_PUBLIC_GROCY_API_KEY=xxx npx expo start --ios
```

These variables are inlined into the JS bundle: never set them for a distributed build.

```bash
npm run typecheck     # tsc --noEmit
npm test              # Jest: totals, price ↔ total link, dates, API client (mocked fetch), checkout…
```

Integration test against a **test Grocy instance** (creates a "ZZ Test courses …" product and adds stock — do not run it against production):

```bash
GROCY_URL=http://localhost:9283 GROCY_API_KEY=xxx npm run test:api
```

Optional: `GROCY_SHOPPING_LIST_ID`, and `GROCY_APPLY_FIXES=1` to let the script create the app's fields (otherwise open the app once and tap « Réparer »). The script checks the fields, adds a product line and a free-text line, checks them off with a price and date in the fields, adds a second price line, checks out, then verifies the stock entries (amount, price, best-before date, store per line), that the lines are gone, that nothing is added twice, and that "never expires" (2999-12-31) is accepted.

## Android CI and releases (GitHub Actions)

`.github/workflows/android.yml`:

- **push to `main` / PR**: `npm ci`, `tsc --noEmit`, Jest (well under a minute);
- **`vX.Y.Z` tag**: additionally `expo prebuild --platform android` then `./gradlew assembleRelease` (JDK 17, arm64-v8a), and a **GitHub Release** with the `courses-grocy-vX.Y.Z.apk` APK and notes generated from the commits. The app version comes from the tag, the `versionCode` from the run number;
- **manual run** (*Actions → Android → Run workflow*): same build, APK as a workflow artifact only.

Publishing a version:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The APK is signed with the Expo template's debug key: it installs directly on a phone ("unknown sources") but cannot be published to the Play Store. For an x86 emulator, set `ARCHS: arm64-v8a,x86_64` in the workflow.

Reproduce locally (JDK 17+, Android SDK):

```bash
npx expo prebuild --platform android --no-install --clean
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
```

## Layout

```
src/api/grocy.ts        typed client (no RN dependency, reused by the script)
src/logic/              pure logic: totals, priceLink, checkout, scan, grouping, dates, text
src/storage/            secure-store (settings) and AsyncStorage (stocked markers)
src/store/useStore.ts   Zustand store
src/screens/, src/components/
scripts/api-integration-test.ts
```
