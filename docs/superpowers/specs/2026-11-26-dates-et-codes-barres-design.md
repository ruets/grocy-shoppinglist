# Dates de péremption à la validation + association de codes-barres

## Pourquoi
- En magasin, saisir la DLC à chaque article est pénible : elle doit rester **facultative pendant les courses**, modifiable à tout moment, mais **obligatoire pour valider** la liste (chaque produit coché doit avoir une date).
- Le lookup Open Food Facts crée des produits faux (codes magasin en 2…) → **supprimé**.
- Un code inconnu correspond souvent à un produit **déjà présent** dans Grocy (ou sur la liste) : il faut pouvoir **associer le code** à ce produit, pas seulement en créer un nouveau.

## Objectifs / non-objectifs
- Objectif : valider la liste sans aucun produit coché sans date ; saisie rapide d'une main.
- Objectif : code inconnu → associer à un produit existant ou créer.
- Non-objectif : modifier les entrées de stock *après* validation (les dates sont saisies avant).
- Anti-objectif : bloquer le cochage en magasin pour une date.

## Approches envisagées
- A. Champ date sur chaque ligne du récap — simple, mais clavier qui s'ouvre/ferme, longue liste.
- B. **Enchaînement guidé** des produits sans date, un par un.
- C. Scanner le produit pour ouvrir sa date.
- **Retenu : B + C fusionnés** — l'enchaînement guidé propose les produits sans date dans l'ordre, et un bouton « Scanner » permet de sauter directement au produit qu'on a en main.

## Design
### Dates
- Modale d'achat : inchangée (date facultative), + nouveaux raccourcis ci-dessous.
- « Valider (n) » : s'il manque des dates sur des **produits** cochés (texte libre exclu), on ouvre d'abord l'écran **« Dates de péremption »** :
  - compteur « 2 / 5 », nom du produit en gros, quantité ;
  - champ date auto-focus, clavier numérique, Entrée = Suivant ;
  - puces : **« Ne périme pas »** (= `2999-12-31`, convention Grocy), **« Défaut du produit (+N j) »** si le produit a `default_best_before_days > 0` (remplit la date calculée, donc explicite), +3 j, +1 sem., +1 mois ;
  - « Précédent » / « Suivant » ; bouton **« Scanner »** : le code scanné saute au produit coché correspondant (sans toucher à la quantité) ; code d'un produit non coché/inconnu → message ;
  - à la fin → récap de validation.
- Récap : chaque ligne affiche sa date (« jamais » pour 2999-12-31) ; s'il en manque, bandeau « N dates manquantes » qui relance l'enchaînement ; bouton Valider désactivé tant qu'il en manque.
- Saisie rapide : `1203` → 12/03 (année courante, ou suivante si la date est passée), `120327` → 12/03/2027, plus les formats actuels.
- Les dates sont enregistrées localement (comme aujourd'hui) au fil de l'eau : quitter l'écran ne perd rien.

### Codes-barres
- Suppression du lookup Open Food Facts (client, écran, tests) et de la règle « codes en 2… ».
- Code inconnu → écran **« Code inconnu »** :
  - en haut, les produits des lignes **non cochées** de la liste (les plus probables) ;
  - recherche de produit Grocy (même recherche sans accents) ;
  - choisir un produit → « Associer le code à ce produit » (`POST /objects/product_barcodes`) → enchaîne sur la modale d'achat (règles de scan habituelles) ;
  - « Créer un nouveau produit » → formulaire nom actuel → création + code → modale d'achat.

## Laissé au constructeur
- Disposition exacte des écrans, libellés secondaires.
- Si « Défaut du produit » vaut 0 j ou -1 (« jamais »), ne pas afficher la puce (ou l'assimiler à « Ne périme pas » pour -1).
