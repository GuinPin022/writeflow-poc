# WriteFlow — POC de tracking d'écriture dans Word

Add-in Office.js **minimal** dont le seul but est de répondre à la question go/no-go :
*peut-on mesurer de façon fiable et crédible les mots réellement produits dans Word ?*

Il ne contient ni authentification, ni base de données, ni dashboard — uniquement
le moteur de mesure instrumenté et de quoi exporter les résultats pour les comparer
à une « vérité terrain » saisie à la main.

## Prérequis

- Node.js 18+ et npm
- Word (Microsoft 365) : Desktop Windows, Desktop Mac, et/ou Word sur le web
- Compte permettant le *sideloading* d'add-ins

## Installation et lancement

```bash
npm install
npm run validate     # valide manifest.xml
npm start            # genere les certificats https, build, et sideload dans Word
```

`npm start` ouvre Word et charge l'add-in. Sinon : `npm run dev-server` puis
sideload manuel de `manifest.xml` (Insertion > Compléments, ou dossier de confiance).

Les icônes PNG (16/32/64/80) sont fournies dans `assets/` et copiées dans `dist/assets/`
au build. Pour ton propre add-in, remplace le `<Id>` du manifeste par un nouveau GUID.

## Deux modes : local et cloud

Deux manifestes coexistent, avec des `<Id>` différents (donc installables en parallèle) :

- **`manifest.xml`** — pointe vers `https://localhost:3000`. C'est le mode dev local
  (`npm start`). Inchangé, continue de fonctionner comme avant.
- **`manifest.github.xml`** — pointe vers GitHub Pages. C'est la version à distribuer
  aux testeurs, qui n'ont alors **rien à installer** (ni Node, ni dev-server).

## Déploiement GitHub Pages (pour partager aux testeurs)

Préparation unique :

1. Crée un dépôt GitHub (ex. `writeflow-poc`) et pousse ce dossier dedans.
   Le `package-lock.json` **doit** être commité (utilisé par `npm ci`).
2. Dans le dépôt : **Settings → Pages → Source = GitHub Actions**.
3. À chaque `push` sur `main`, le workflow `.github/workflows/deploy.yml` build et publie.

Le workflow **injecte automatiquement** ton nom d'utilisateur et le nom du dépôt dans
le manifeste cloud. Après le premier déploiement, tes URLs sont :

- Add-in : `https://OWNER.github.io/REPO/taskpane.html`
- Manifeste à donner aux testeurs : `https://OWNER.github.io/REPO/manifest.github.xml`

(Si tu utilises ce manifeste hors CI, remplace `YOUR-USERNAME` / `writeflow-poc` à la main.)

### Comment les testeurs l'installent (rien à compiler)

- **Word sur le web** (le plus simple, tout OS) : Accueil → Compléments → Plus de
  paramètres → Charger mon complément → choisir le `manifest.github.xml` téléchargé.
- **Word Desktop Mac** : déposer `manifest.github.xml` dans
  `~/Library/Containers/com.microsoft.Word/Data/Documents/wef`, puis redémarrer Word.
- **Word Desktop Windows** : dossier partagé déclaré comme catalogue de confiance
  (Options → Centre de gestion de la confidentialité → Catalogues approuvés), puis
  Accueil → Compléments → Avancé → DOSSIER PARTAGÉ.

Prérequis testeur : un compte Microsoft 365 avec Word. Les données restent locales
(export CSV) ; chacun renvoie son CSV.

## Utilisation pendant les tests

1. Ouvrir le panneau (bouton « Ouvrir le tracker » dans l'onglet Accueil).
2. Cliquer **Démarrer**. Le relevé se fait toutes les 30 s ; « Relever maintenant »
   force un relevé immédiat pour les tests courts.
3. Ouvrir la **console (F12)** pour voir le journal en direct.
4. Jouer un scénario en notant la **vérité terrain** (mots réellement tapés).
5. **Export CSV/JSON** et comparer `typedProductionCumulative` à la vérité terrain.

## Architecture du code

| Fichier | Rôle |
|---|---|
| `manifest.xml` | Déclaration de l'add-in. `WordApi 1.3` requis (socle large), `1.5` détecté à l'exécution. |
| `src/tracking/tracker.ts` | Moteur **hybride** : polling + événements paragraphe + diff + classification. |
| `src/tracking/types.ts` | Config, seuils, modèle de production (`real` / `net`), structure des événements. |
| `src/tracking/logger.ts` | Journal en mémoire + export CSV/JSON + `console.table`. |
| `src/tracking/offlineQueue.ts` | File locale (localStorage) pour le test hors-ligne. |
| `src/taskpane/*` | UI de pilotage et compteurs. |

## Les 3 leviers à régler (dans `types.ts` → `DEFAULT_CONFIG`)

- `pollIntervalMs` — fréquence de relevé (défaut 30 s).
- `absolutePasteThresholdWords` — delta au-dessus duquel un relevé est présumé collage.
- `maxTypingWordsPerSecond` — vitesse de frappe humaine max plausible ; au-delà = collage/dictée.

Le POC sert précisément à **mesurer la justesse de ces seuils**, pas à les supposer corrects.

## Correspondance code ↔ scénarios du protocole

| Scénario du protocole | Où l'observer |
|---|---|
| Frappe continue | `classification = "typed"`, `typedProductionCumulative` croît |
| **Coller un gros bloc** | doit donner `classification = "paste"` (colonne `pastedWords`) — **cas critique** |
| Suppression / révision | `classification = "deletion"` ; en modèle `real`, `typedProduction` ne baisse pas |
| Dictée / autocorrection | arrive par blocs → vérifier si classé `typed` ou `paste` (à documenter) |
| Inactivité > 15 min | `sessionState = "idle-closed"` |
| Document long (80–100k mots) | colonne `latencyMs` — seuil GO < 200 ms |
| Cohérence cross-plateforme | colonne `platform` ; comparer les exports Desktop vs Web |
| Mode hors-ligne | « Couper le réseau » → `queue` augmente → « Vider la file » à la reconnexion |
| WordApi 1.5 absent | warning console « mode polling seul » → limitation plateforme à noter |

## Limites connues (assumées pour un POC)

- **Détection du collage = heuristique** (seuil + vitesse). Office.js n'expose pas
  d'événement « paste » fiable dans Word ; mesurer le taux de faux positifs/négatifs
  est l'un des livrables du POC.
- Le comptage se fait sur `body.text` : **notes de bas de page, zones de texte et
  en-têtes/pieds ne sont pas inclus** en l'état. À tester explicitement.
- `countWords` segmente sur les espaces — convention à figer (la définition du « mot »
  doit être identique partout dans le futur produit).
- File hors-ligne en `localStorage` pour le POC ; passer à **IndexedDB** en production.

## Décision attendue

À l'issue des tests, remplir le tableau de seuils du protocole (précision, latence,
collage, cross-plateforme, offline) et conclure **GO / NO-GO / GO conditionnel**.
