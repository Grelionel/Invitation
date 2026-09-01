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

### 1 bis. Mettre à jour une base déjà créée

Si la base existait avant l'ajout du QR code et du tirage par catégorie,
exécutez **une fois** `supabase/migration-lien-genre.sql` dans le SQL Editor. Il
fusionne « Ami » et « Connaissance » en un seul cercle et ajoute la colonne
`gender`, sur laquelle repose la répartition des vingt cadeaux.

La migration met tous les invités existants à « Homme » — la base ne peut pas le
deviner. Le fichier se termine par la requête qui corrige les « Madame » et
« Mademoiselle » d'un coup ; relisez la liste ensuite.

Exécutez ensuite **une fois** `supabase/migration-realtime.sql`. Supabase ne
diffuse en direct que les tables inscrites à la publication `supabase_realtime`,
et une base créée avant que `schema.sql` ne gagne cette section accepte
l'abonnement sans broncher puis n'envoie jamais rien : on confirme une présence
sur le téléphone, l'écran de la salle ne bouge pas. C'est le symptôme à
reconnaître.

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
   Le lien porte le genre — « Parent (Femme) », « Collègue (Homme) »… — parce que
   le tirage au sort répartit ses lots entre les deux.
3. **Avant le jour J**, imprimez les billets : ouvrez chaque invité et
   téléchargez son QR code. Il contient son nom, sa table, et le lien qui ouvre
   sa fiche.
4. À l'arrivée : scannez le billet avec l'appareil photo du téléphone. Le site
   s'ouvre sur la fiche de l'invité, avec un bouton **Confirmer la présence**.
   Le badge **Attend** de la liste fait la même chose, pour un invité qui a
   oublié son billet.
5. Dans la salle : ouvrez `/display` en plein écran. Il diffuse les photos et
   souhaite la bienvenue à chaque invité dès qu'il est marqué présent, cinq
   secondes chacun, dans l'ordre des arrivées. Cet écran n'a plus aucun bouton :
   il fait face à la salle, et les photos se gèrent depuis la première page.
6. En fin de soirée : `/lottery` distribue les vingt cadeaux, cercle par cercle.

Le pointage peut se faire depuis n'importe quel appareil ouvert sur le site :
Supabase **pousse** les changements, l'écran de la salle réagit donc sans délai.
Et si le direct tombe — publication non faite, réseau capricieux —, la liste est
de toute façon relue toutes les quatre secondes : l'écran accuse quelques
secondes de retard au lieu de rester muet, et un message le signale une fois.

## Les QR codes des billets

Chaque invité a un QR code, visible dans sa fiche et téléchargeable en PNG. Il
ne contient pas une carte de visite mais **un lien** vers le site, portant le
numéro de l'invité, son nom et sa table : l'appareil photo d'un téléphone
l'ouvre donc sans rien installer, et le site affiche la fiche avec le bouton
**Confirmer la présence**.

Si vous imprimez les billets depuis `localhost`, renseignez `publicBaseUrl` dans
`src/environments/environment.ts` avec l'adresse publique du site — sinon les QR
codes pointeront vers le PC de saisie et aucun téléphone ne les ouvrira.

## Le tirage au sort

Vingt cadeaux, répartis entre six cercles :

| Cercle                     | Cadeaux |
| -------------------------- | ------- |
| Parent (Homme)             | 4       |
| Ami / Connaissance (Homme) | 3       |
| Collègue (Homme)           | 3       |
| Parent (Femme)             | 4       |
| Ami / Connaissance (Femme) | 3       |
| Collègue (Femme)           | 3       |

Sont tirés au sort les invités **présents**, ayant répondu **« Chrétien : Non »**
et appartenant à l'un de ces six cercles — les invités de l'Église en sont
exclus par construction. Personne ne gagne deux fois.

Le bouton principal tire un cercle au hasard, pondéré par ce qu'il lui reste de
cadeaux ; chaque carte permet aussi de tirer un cercle en particulier. Le
gagnant est choisi au moment du clic : le paquet-cadeau qui tremble en comptant
**cinq secondes** avant d'exploser est là pour la salle, pas pour le tirage — un
invité qui entre pendant le décompte ne change pas un résultat déjà acquis.

Les gagnants sont gardés dans le navigateur qui a fait le tirage : rechargez la
page sans crainte, mais faites tous les tirages depuis le même appareil.

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

Le soir même, l'icône **🖼 Photos du diaporama** de la première page ouvre la
liste des photos ajoutées : on en ajoute, on en supprime une par une, ou on
efface tout. Le changement part à l'écran d'accueil sans le recharger.

Elles sont réduites à 1920 px avant d'être envoyées — une photo de téléphone
pèse plusieurs mégaoctets et aucun vidéoprojecteur n'en montre autant.

### Partager les photos entre les appareils

Exécutez **une fois** `supabase/migration-slides-storage.sql` dans le SQL
Editor : il crée le bucket `slides` et ses règles d'accès. Les photos partent
alors dans Supabase Storage, donc une photo prise au téléphone pendant la
réception arrive sur l'écran de la salle — celui-ci relit le bucket toutes les
minutes.

Sans ce bucket, l'application retombe sur le stockage du navigateur : les photos
restent privées à l'appareil qui les a choisies. Ajoutez-les alors depuis la
machine branchée au vidéoprojecteur.

Deux choses à savoir avant de créer le bucket :

- **Il est public**, comme le reste de la base : les fichiers sont lisibles par
  qui connaît leur adresse. C'est ce qui permet de les afficher dans une balise
  `<img>` sans jeton qui expire au milieu de la soirée.
- **L'écran dépend alors du réseau de la salle.** Le navigateur garde les photos
  déjà affichées dans son cache et le diaporama continue de tourner si une
  image ne se charge pas, mais un réseau vraiment coupé finit par se voir. Si le
  wifi du lieu vous inquiète, ne créez pas le bucket : le stockage local ne
  dépend de rien.

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
supabase/         schema.sql (à exécuter une fois), ses migrations et le diagramme
scripts/          manifeste des photos, envoi de la liste vers Supabase
data/             liste des invités servant de jeu de départ
legacy/           invite.css, conservé mais inutilisé par l'application
```
