# Invitation

Gestion des invités d'un mariage : liste et plan de table, check-in par QR code
à l'entrée, écran d'accueil dans la salle et tirage au sort.

Application [Angular 21](https://angular.dev) accompagnée d'un petit serveur
Node sans dépendance, qui partage la liste des invités entre le PC, le téléphone
qui scanne à l'entrée et l'écran de la salle.

## Prérequis

Node.js `^20.19`, `^22.12` ou `>=24`.

```bash
npm install
```

## Développement

Deux terminaux :

```bash
npm run serve:api   # API sur http://localhost:3000
npm start           # application sur http://localhost:4200
```

`ng serve` redirige `/api` vers le serveur Node (voir `proxy.conf.json`), il n'y
a donc rien à configurer.

## Le jour du mariage

1. Connectez le PC au WiFi du lieu.
2. Compilez et lancez le tout :

   ```bash
   npm run build
   npm run serve
   ```

3. Le terminal affiche l'adresse réseau, par exemple `http://192.168.1.64:3000`.
   C'est celle-ci que les téléphones doivent utiliser — pas `localhost`.
4. Ouvrez cette adresse sur le PC, puis renseignez-la dans l'encadré
   « Configuration Réseau » en bas à droite.
5. Ajoutez les invités, téléchargez leurs QR codes et imprimez-les.
6. À l'entrée : le téléphone se connecte au **même** WiFi et scanne le QR, ce
   qui ouvre `/scan?id=…` ; « Présent » enregistre l'arrivée.
7. Dans la salle : ouvrez `/display` en plein écran. L'écran diffuse les photos
   et souhaite la bienvenue à chaque invité dès qu'il est validé à l'entrée.

## Déploiement : Vercel + Supabase

Le site est **entièrement statique** : Vercel ne fait que servir des fichiers,
il n'exécute aucun code à vous. Le navigateur parle directement à **Supabase**,
qui héberge la liste des invités.

Pourquoi une base extérieure ? Parce que le stockage d'un navigateur est privé à
son appareil : ce que le téléphone de l'entrée enregistre est invisible pour le
PC. Il faut donc un endroit commun où les trois appareils lisent et écrivent la
même liste.

### 1. Créer la base

1. Créez un projet sur [supabase.com](https://supabase.com) (offre gratuite).
2. Ouvrez **SQL Editor → New query**, collez le contenu de
   `supabase/schema.sql`, puis **Run**. Cela crée la table et ses règles d'accès.

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

### 3. Reprendre la liste existante

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

### 5. Le jour du mariage

Ouvrez `https://votre-projet.vercel.app` sur chaque appareil : le PC sur `/`,
l'écran de la salle sur `/display`, et le téléphone de l'entrée qui scanne les
QR codes. Il n'y a plus d'IP à recopier — pensez à regénérer les QR codes après
le déploiement pour qu'ils pointent vers l'adresse Vercel.

Deux changements par rapport au serveur local :

- Les écrans ne s'interrogent plus toutes les deux secondes : Supabase **pousse**
  les changements, un pointage à l'entrée s'affiche donc immédiatement.
- Le bouton « Scanner » fonctionne enfin sur téléphone. L'accès à la caméra
  exige du HTTPS, ce que Vercel fournit et pas `http://192.168.x.x`.

### Sécurité : à lire avant le jour J

Vos invités chargent le site quand ils scannent leur QR code. Ils reçoivent donc
la clé `anon`, et avec les règles de `supabase/schema.sql`, **n'importe lequel
d'entre eux peut lire toute la liste — numéros de téléphone compris — et la
modifier.**

Si cela vous gêne, exécutez ensuite `supabase/schema-secure.sql`. Un invité ne
voit alors plus que les colonnes non personnelles et ne peut que se marquer
présent ; la gestion demande un compte opérateur, à créer dans
**Authentication → Users** et à connecter une fois sur le PC.

### Si le réseau tombe : le mode local

Supabase exige internet pendant toute la soirée. La solution de secours reste
disponible et fonctionne **sans aucune connexion** : videz les deux valeurs de
`src/environments/environment.ts`, puis

```bash
npm run build
npm run serve
```

L'application repasse alors sur `server/server.js` et `data/guests.json`, comme
avant le déploiement. C'est le même code : seul le choix de la base change.

## Pages

| Route      | Rôle                                                         |
| ---------- | ------------------------------------------------------------ |
| `/`        | Liste des invités, tables, statistiques, QR codes, scanner   |
| `/scan`    | Validation de présence à l'entrée (`?id=` fourni par le QR)  |
| `/display` | Écran d'accueil de la salle : photos et message de bienvenue |
| `/lottery` | Tirage au sort parmi les invités présents et éligibles       |

## Scripts

| Commande                  | Rôle                                              |
| ------------------------- | ------------------------------------------------- |
| `npm start`               | Serveur de développement Angular                  |
| `npm run build`           | Compilation de production dans `dist/invitation`  |
| `npm test`                | Tests unitaires (Vitest)                          |
| `npm run serve:api`       | Serveur Node, API seule                           |
| `npm run serve`           | Serveur Node, API + application compilée          |
| `npm run slides:manifest` | Régénère la liste des photos de l'écran d'accueil |
| `npm run seed:supabase`   | Envoie `data/guests.json` vers la base Supabase   |
| `npm run format`          | Formatage Prettier                                |

## Données

La liste vit à un seul endroit, choisi automatiquement selon que
`src/environments/environment.ts` est rempli ou non :

| Où                                        | Quand                              |
| ----------------------------------------- | ---------------------------------- |
| Supabase (table `guests`)                 | site déployé, valeurs renseignées  |
| `data/guests.json` via `server/server.js` | mode local, valeurs laissées vides |

Chaque navigateur en garde aussi une copie dans IndexedDB, ce qui permet
d'afficher la liste immédiatement au chargement et de ne rien perdre pendant une
coupure. L'application prévient quand une modification n'a pas pu être partagée.

Le pointage à l'entrée ne réécrit qu'une ligne, jamais la liste entière : le
téléphone ne peut donc pas effacer une modification en cours sur le PC.

Les tables (les passages bibliques) restent locales au PC : elles ne changent
pas pendant la soirée et aucun autre appareil ne s'en sert.

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
    models/       Guest, tables bibliques, limites de la salle
    services/     stockage local, magasin d'état, notifications
                  et les deux bases : Supabase ou serveur local
  features/       une page par dossier (guests, scan, lottery, display)
  shared/         composants réutilisables (modale, QR code, toasts)
src/environments/ URL et clé Supabase (vides = mode local)
src/styles/       feuilles de style historiques du site statique
supabase/         le SQL à exécuter une fois dans Supabase
server/           serveur Node du mode local, sans connexion internet
scripts/          manifeste des photos, envoi de la liste vers Supabase
data/             liste des invités en mode local
legacy/           invite.css, conservé mais inutilisé par l'application
```
