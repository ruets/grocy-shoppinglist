# Dates à la validation + association de codes-barres — plan

> Exécution : native (dans la session), sur demande « vas-y ».

**Goal:** DLC obligatoire pour valider (saisie guidée + scan), association d'un code inconnu à un produit existant, suppression d'Open Food Facts.
**Architecture:** logique pure dans `src/logic/` (testée Jest), UI dans les modales existantes ; la saisie des dates devient une phase de `CheckoutModal` (pas de modale supplémentaire, évite les transitions iOS).
**Spec:** `docs/superpowers/specs/2026-11-26-dates-et-codes-barres-design.md`

## Global Constraints
- « Ne périme pas » = `2999-12-31` ; affiché « jamais ».
- Texte libre exclu de l'obligation de date.
- Bouton Valider désactivé tant qu'un produit coché n'a pas de date.

## Review Focus
- `1203` saisi le 26/11 → l'année suivante (date passée) ; `2611` le 26/11 → aujourd'hui (pas l'an prochain).
- Produit avec `default_best_before_days` = -1 → puce « Ne périme pas » seulement ; 0 → pas de puce défaut.
- Scan pendant la saisie des dates d'un produit non coché / inconnu → message, pas de changement.
- Ligne décochée pendant la saisie (refresh) → retirée du parcours sans crash.
- Associer un code déjà lié à un autre produit → erreur Grocy affichée lisiblement.

### Task 1: dates (`src/logic/dates.ts`)
- `parseUserDate` : accepte `JJMM`, `JJMMAA`, `JJMMAAAA` ; sans année → année courante, ou suivante si < aujourd'hui (idem `JJ/MM`).
- `NEVER_EXPIRES = '2999-12-31'`, `formatBestBefore(iso) → 'jamais' | 'JJ/MM/AAAA'`.
- `productDefaultBestBefore(days: number|null, today) → string|null` (-1 → NEVER_EXPIRES, >0 → today+days, sinon null).
- Tests : `misc.test.ts` (Review Focus 1 et 2).

### Task 2: logique de validation (`src/logic/checkout.ts`)
- `linesMissingBestBefore(lines, getLocal) → ShoppingLine[]` : cochées, avec produit, sans `bestBefore`.
- Tests : `checkout.test.ts`.

### Task 3: retirer Open Food Facts
- Supprimer `externalBarcodeLookup`, `isInStoreBarcode`, leurs tests, l'étape OFF de `ListScreen`.
- `Product.default_best_before_days: number | null` (normalisé).

### Task 4: écran « Code inconnu » (`src/screens/UnknownBarcodeModal.tsx`, remplace `NewProductModal`)
- Suggestions : produits des lignes non cochées ; puis `ProductPicker` (recherche + « Créer « x » dans Grocy »).
- « Associer le code et continuer » → store `addBarcode(productId, code)` → reloadProducts → `openForProduct`.

### Task 5: validation guidée (`CheckoutModal`)
- Phases `dates | recap | result`. Ouverture : `dates` si `linesMissingBestBefore` non vide.
- Phase dates : snapshot des ids manquants, index courant, compteur, champ auto-focus (Entrée = suivant), puces (Ne périme pas, Défaut produit, +3 j, +1 sem., +1 mois), Précédent/Suivant, bouton Scanner (ScannerModal imbriqué) → saute à la ligne cochée du produit, sinon toast.
- Enregistrement immédiat via store `setBestBefore(lineId, iso|null)`.
- Recap : date par ligne, bandeau « N dates manquantes » → phase dates ; Valider désactivé si manque.
- Raccourcis aussi dans `PurchaseModal` (Ne périme pas, Défaut produit).

### Task 6: vérification
- `npx tsc --noEmit`, `npx jest`, `npx expo export --platform ios`, `npm run test:api` contre l’instance Grocy.
