# Invitation

Gestion des invités d'un mariage : liste et plan de table, pointage des
présences, écran d'accueil dans la salle et tirage au sort.

Application [Angular 21](https://angular.dev) entièrement statique, adossée à
**Supabase** pour la liste des invités. Le stockage d'un navigateur est privé à
son appareil : il faut donc une base commune pour que le PC, l'écran de la salle
et un téléphone voient la même liste.

## Prérequis

Node.js `^20.19`, `^22.12` ou `>=24`.

```bash
npm install
```

## Développement

```bash
npm start   # application sur http://localhost:4200
```

Sans identifiants Supabase, l'application démarre quand même : chaque navigateur
garde alors sa propre liste dans IndexedDB, sans rien partager. C'est pratique
pour développer, pas pour le jour J.

## Brancher Supabase

### 1. Créer la base

1. Créez un projet sur [supabase.com](https://supabase.com) (offre gratuite).
2. Ouvrez **SQL Editor → New query**, collez le contenu de
   `supabase/schema.sql`, puis **Run**. Cela crée les deux tables, les règles
   que la base fait respecter et les 30 passages bibliques.

### 2. Brancher l'application

Dans **Project Settings → Data API**, relevez l'URL du projet et la clé
`anon public`, puis reportez-les dans `src/environments/environment.ts` :

```ts
export const environment = {
  supabaseUrl: 'https://xxxxxxxx.supabase.co',
  supabaseAnonKey: 'eyJhbG...',
};
```

Ces valeurs vivent dans le code du site, c'est normal : la clé `anon` est
publique par conception, ce sont les règles d'accès qui protègent la base. Ne
mettez **jamais** la clé `service_role` ici.

### 3. Reprendre une liste existante

```bash
npm run seed:supabase -- https://xxxxxxxx.supabase.co eyJhbG...
```

Le script refuse d'écraser une base non vide ; ajoutez `--force` si c'est
vraiment voulu.

### 4. Publier sur Vercel

1. Poussez vos modifications sur GitHub.
2. Sur [vercel.com](https://vercel.com) : **Add New… → Project**, choisissez le
   dépôt, puis **Deploy**. `vercel.json` indique déjà quoi construire et quoi
   publier.

Chaque `git push` redéclenche un déploiement.

### Sécurité : à lire avant le jour J

L'application n'a pas d'écran de connexion : elle parle à la base avec la clé
`anon`, qui vit dans le code du site. Toute personne qui ouvre l'URL peut donc
**lire toute la liste — numéros de téléphone compris — et la modifier.**

C'est un choix assumé : personne d'autre que vous n'est censé connaître
l'adresse, et le jour du mariage compte plus qu'un mot de passe à retrouver. Ne
publiez pas l'URL, et videz la base une fois la fête passée.

Une variante verrouillée derrière un compte opérateur a existé
(`supabase/schema-secure.sql`, commit `de4217c`) ; elle demandait un écran de
connexion que l'application n'a pas.

## Le jour du mariage

1. Ouvrez le site sur le PC qui tient la liste.
2. Ajoutez les invités : statut, nom, prénom, table, lien, chrétien et contact.
3. À l'arrivée d'un invité, cliquez sur son badge **Attend** dans la colonne
   « Présence » : il passe à **Présent**.
4. Dans la salle : ouvrez `/display` en plein écran. Il diffuse les photos et
   souhaite la bienvenue à chaque invité dès qu'il est marqué présent.
5. En fin de soirée : `/lottery` tire au sort parmi les invités présents et
   éligibles.

Le pointage peut se faire depuis n'importe quel appareil ouvert sur le site :
Supabase **pousse** les changements, l'écran de la salle réagit donc sans délai.

## Pages

| Route      | Rôle                                                         |
| ---------- | ------------------------------------------------------------ |
| `/`        | Liste des invités, tables, statistiques et pointage          |
| `/display` | Écran d'accueil de la salle : photos et message de bienvenue |
| `/lottery` | Tirage au sort parmi les invités présents et éligibles       |

## Scripts

| Commande                  | Rôle                                              |
| ------------------------- | ------------------------------------------------- |
| `npm start`               | Serveur de développement Angular                  |
| `npm run build`           | Compilation de production dans `dist/invitation`  |
| `npm test`                | Tests unitaires (Vitest)                          |
| `npm run slides:manifest` | Régénère la liste des photos de l'écran d'accueil |
| `npm run seed:supabase`   | Envoie `data/guests.json` vers la base Supabase   |
| `npm run format`          | Formatage Prettier                                |

## Données

Deux entités dans Supabase : `wedding_table`, la table de la salle nommée
d'après un passage biblique, et `guest`, qui la référence. Chaque navigateur
garde une copie de l'ensemble dans IndexedDB, ce qui permet d'afficher la liste
immédiatement au chargement et de ne rien perdre pendant une coupure.

**Ce que la base tient elle-même**, et que l'application ne recalcule donc pas :

| Règle                              | Comment                               |
| ---------------------------------- | ------------------------------------- |
| Les identifiants                   | `generated always as identity`        |
| « Un couple occupe deux couverts » | colonne générée `seats`               |
| « La table est pleine »            | trigger, avec verrou sur la table     |
| L'heure d'arrivée                  | `checked_in_at` (`present` en dérive) |

Chaque modification ne touche qu'une ligne, jamais la liste entière : deux
appareils qui écrivent en même temps ne s'effacent donc pas l'un l'autre. Quand
la base refuse une écriture — une table pleine, le plus souvent — l'application
le dit et n'affiche pas un invité qui n'existe pas.

Sans identifiants Supabase, l'application sème elle-même les 30 tables et minte
ses propres identifiants, mais ne partage rien.

## Photos de l'écran d'accueil

Déposez les images dans `public/assets/img/slide/`, puis :

```bash
npm run slides:manifest
```

Le manifeste est aussi régénéré automatiquement avant `npm start` et
`npm run build`.

## Structure

```
src/app/
  core/           modèles, constantes et services partagés
    models/       Guest et WeddingTable, miroirs des deux tables de la base
    services/     stockage IndexedDB, magasin d'état, notifications
                  et la base partagée (Supabase)
  features/       une page par dossier (guests, lottery, display)
  shared/         composants réutilisables (modale, toasts)
src/environments/ URL et clé Supabase (vides = chaque appareil pour soi)
src/styles/       feuilles de style historiques du site statique
supabase/         schema.sql (à exécuter une fois) et son diagramme
scripts/          manifeste des photos, envoi de la liste vers Supabase
data/             liste des invités servant de jeu de départ
legacy/           invite.css, conservé mais inutilisé par l'application
```
