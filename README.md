# Courses Grocy

Liste de courses mobile (Expo / React Native, TypeScript) connectée à une instance **Grocy 4.7.x**.
Tourne dans **Expo Go** (iPhone / Android), sans build natif. Interface en français, gros boutons, mode sombre automatique.

## Installation

```bash
npm install
npx expo start
```

Scannez le QR code affiché avec **Expo Go** (Android) ou l'appareil photo (iPhone). Le téléphone doit joindre la machine de dev (même Wi-Fi), ou utilisez `npx expo start --tunnel`.

## Clé API Grocy

Dans Grocy : menu utilisateur (en haut à droite) → **Gérer les clés API** → **Ajouter**. Copiez la clé, puis dans l'app : **Réglages** → URL (ex. `https://grocy.maison.lan`, sans `/api`) + clé → **Tester la connexion** → choisissez la liste → **Enregistrer**.
L'URL et la clé sont stockées dans le trousseau via `expo-secure-store`.

## HTTP vs HTTPS (iOS)

Expo Go autorise le HTTP en clair, mais une app iOS « réelle » (build EAS/standalone) bloque le HTTP via **App Transport Security**. Utilisez **HTTPS** : avec Caddy, un bloc du type

```
grocy.maison.lan {
    tls internal        # ou un vrai certificat (DNS challenge)
    reverse_proxy 127.0.0.1:9283
}
```

suffit (avec `tls internal`, installez la CA locale de Caddy sur le téléphone). Fonctionne aussi bien en LAN que via WireGuard.

## Utilisation

- **Case à gauche** d'un article → modale d'achat : quantité, prix unitaire ↔ total (liés dans les deux sens, le champ en surbrillance est celui conservé quand la quantité change), DLC optionnelle (vide = défaut du produit). « Retirer du panier » pour décocher.
- **Nom de l'article** → modifier / supprimer. Sans produit choisi = article « texte libre ».
- **Scanner** : EAN-13/8, UPC-A/E, Code128, saisie manuelle en secours. Code inconnu → l’associer à un produit existant (ceux de la liste d’abord) ou créer un nouveau produit.
- **Valider** : ajoute au stock chaque article coché (quantité, prix, DLC, magasin) puis supprime la ligne ; les textes libres sont simplement supprimés.
- Totaux en tête : **Panier** (prix saisis, sinon estimation), **Reste** (dernier prix), **Liste**. `~` = estimation.

Le prix payé et la DLC sont stockés localement (AsyncStorage) par ligne, avec un flag `stocked` pour ne jamais ajouter deux fois au stock si la suppression de la ligne a échoué.

## Développement

Dans le simulateur iOS (copier-coller indisponible), on peut préremplir les réglages au premier lancement, **en développement uniquement** :

```bash
EXPO_PUBLIC_GROCY_URL=https://grocy.exemple.fr EXPO_PUBLIC_GROCY_API_KEY=xxx npx expo start --ios
```

Ces variables sont intégrées au bundle JS : ne jamais les définir pour un build distribué.

```bash
npm run typecheck     # tsc --noEmit
npm test              # Jest : totaux, lien prix ↔ total, client API (fetch simulé), validation…
```

Test d'intégration contre un **Grocy de test** (crée un produit « ZZ Test courses … », ajoute du stock — ne pas lancer sur la prod) :

```bash
GROCY_URL=http://localhost:9283 GROCY_API_KEY=xxx npm run test:api
```

Optionnel : `GROCY_SHOPPING_LIST_ID`. Le script lit la liste, ajoute une ligne produit + une ligne texte libre, les coche avec prix, valide, puis vérifie l'entrée de stock (quantité, prix, DLC, magasin), la disparition des lignes et l'absence de double ajout.

## CI Android et releases (GitHub Actions)

`.github/workflows/android.yml` :

- **push sur `main` / PR** : `npm ci`, `tsc --noEmit`, Jest (quelques dizaines de secondes) ;
- **tag `vX.Y.Z`** : en plus, `expo prebuild --platform android` puis `./gradlew assembleRelease` (JDK 17, arm64-v8a), et création d'une **Release GitHub** avec l'APK `courses-grocy-vX.Y.Z.apk` et des notes générées depuis les commits. La version de l'app vient du tag, le `versionCode` du numéro de run ;
- **lancement manuel** (*Actions → Android → Run workflow*) : même build, APK en artefact seulement.

Publier une version :

```bash
git tag v1.0.0
git push origin v1.0.0
```

L'APK est signé avec la clé de debug du template Expo : installable directement sur un téléphone (« sources inconnues »), mais pas publiable sur le Play Store. Pour un émulateur x86, mettre `ARCHS: arm64-v8a,x86_64` dans le workflow.

Reproduire en local (JDK 17+, SDK Android) :

```bash
npx expo prebuild --platform android --no-install --clean
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
```

## Structure

```
src/api/grocy.ts        client typé (sans dépendance RN, réutilisé par le script)
src/logic/              calculs purs : totals, priceLink, checkout, scan, grouping, dates, text
src/storage/            secure-store (réglages) et AsyncStorage (données par ligne)
src/store/useStore.ts   store Zustand
src/screens/, src/components/
scripts/api-integration-test.ts
```
