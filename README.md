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
| `npm run format`          | Formatage Prettier                                |

## Données

Le serveur conserve la liste dans `data/guests.json`, et chaque navigateur en
garde une copie dans IndexedDB. Écrire passe d'abord par IndexedDB puis par le
serveur : une coupure réseau ne fait donc rien perdre, et l'application prévient
quand une modification n'a pas pu être partagée.

L'API est exposée sous `/api/guests` (`GET` et `POST`). `/guests` reste accepté
pour les anciens QR codes imprimés avant la migration.

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
    services/     stockage local, API, magasin d'état, notifications
  features/       une page par dossier (guests, scan, lottery, display)
  shared/         composants réutilisables (modale, QR code, toasts)
src/styles/       feuilles de style historiques du site statique
server/           serveur Node : API et service des fichiers compilés
scripts/          génération du manifeste des photos
data/             liste des invités persistée par le serveur
legacy/           invite.css, conservé mais inutilisé par l'application
```
