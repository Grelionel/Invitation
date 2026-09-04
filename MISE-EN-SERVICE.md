# Mise en service des changements d'`amélioration3.md`

Le code est fusionné et déployé. Ce qui suit le rend effectif : trois des quatre
demandes dépendent de réglages qui vivent **dans Supabase**, pas dans le dépôt.

Toutes les vérifications se font sur l'**URL publique du site**, jamais sur
`localhost`.

## Étape 1 — Activer le direct dans Supabase _(indispensable au scan)_

C'est la cause exacte du « je confirme la présence au téléphone, rien ne se
passe ». Supabase ne diffuse que les tables inscrites à la publication
`supabase_realtime`, et une base créée avant cette section du schéma accepte
l'abonnement sans rien envoyer.

1. Supabase → votre projet → **SQL Editor** → **New query**.
2. Collez tout le contenu de `supabase/migration-realtime.sql`.
3. **Run**.
4. La requête finale doit afficher **deux lignes** :

   | schemaname | tablename     |
   | ---------- | ------------- |
   | public     | guest         |
   | public     | wedding_table |

Si vous n'en voyez qu'une ou aucune, la migration n'a pas abouti : relisez le
message d'erreur avant d'aller plus loin.

> À exécuter une seule fois. Réexécuter le fichier ne casse rien.

## Étape 2 — Créer le bucket des photos _(pour partager le diaporama)_

Sans ce bucket, l'ajout de photos fonctionne quand même, mais les photos restent
**privées à l'appareil** qui les a choisies : une photo prise au téléphone
n'atteindra jamais le vidéoprojecteur.

1. **SQL Editor** → **New query**.
2. Collez le contenu de `supabase/migration-slides-storage.sql`.
3. **Run**.
4. Les deux requêtes finales doivent afficher :
   - le bucket `slides` avec `public = true` ;
   - trois règles : `diaporama ajout`, `diaporama lecture`, `diaporama suppression`.

> Le bucket est public : les photos sont lisibles par qui connaît leur adresse.
> Si le wifi de la salle vous inquiète plus que ça, sautez cette étape et ajoutez
> les photos depuis la machine branchée au vidéoprojecteur.

## Étape 3 — Vérifier l'adresse des QR codes

Ouvrez `src/environments/environment.ts` :

- **Billets imprimés depuis le site déployé** → laissez `publicBaseUrl: ''`.
  L'application prend l'adresse de la page en cours, c'est le bon réglage.
- **Billets imprimés depuis `localhost`** → mettez l'URL publique du site (ex.
  `publicBaseUrl: 'https://mon-site.vercel.app'`), sinon les QR codes pointeront
  vers le PC de saisie et aucun téléphone ne les ouvrira. Commit + push, et
  attendez le nouveau déploiement.

---

# Recette — vérifier les quatre demandes

## A. Le scan confirme la présence et l'affiche 5 secondes

1. Sur le PC : ouvrez un invité, téléchargez son QR code (ou affichez-le à
   l'écran).
2. Sur un second appareil, ouvrez `/display` en plein écran.
3. Avec l'appareil photo d'un téléphone, scannez le QR code. Le site s'ouvre
   directement sur la fiche de l'invité, avec le bouton **Confirmer la
   présence**.
4. Appuyez dessus.
5. **Attendu** : l'écran d'accueil interrompt le diaporama et souhaite la
   bienvenue à l'invité pendant **cinq secondes**, puis revient aux photos.

Points à contrôler en plus :

- **Deux scans coup sur coup** : les deux invités doivent être annoncés l'un
  après l'autre, cinq secondes chacun, dans l'ordre des arrivées — plus aucun
  n'est perdu.
- **Réactivité** : avec l'étape 1 faite, l'écran réagit quasi instantanément.
  S'il met systématiquement ~4 secondes, c'est la relecture de secours qui
  travaille : le direct n'est pas actif, reprenez l'étape 1.
- Le badge **Attend** de la liste fait la même chose, pour un invité qui a
  oublié son billet.

## B. Le tirage au sort

1. Marquez présents quelques invités, dont au moins un **Chrétien : Non** et un
   **Chrétien : Oui**.
2. Ouvrez `/lottery`, lancez un tirage.
3. **Attendu** :
   - seuls les invités **présents**, **non chrétiens** et rattachés à l'un des
     six cercles (Parent / Ami-Connaissance / Collègue × Homme-Femme) peuvent
     sortir — les invités « Église » sont exclus par construction ;
   - un **paquet-cadeau** tremble en comptant **cinq secondes**, puis explose
     pour révéler le gagnant ;
   - personne ne gagne deux fois, et le total fait bien 20 cadeaux (4/3/3
     hommes, 4/3/3 femmes).

> Les gagnants sont mémorisés dans **le navigateur qui a fait le tirage**. Faites
> tous les tirages depuis le même appareil.

## C. Les photos, depuis la première page

1. Sur la première page, cliquez l'icône **🖼 Photos du diaporama** (à côté des
   autres icônes).
2. Ajoutez une photo → elle doit apparaître sur `/display` **sans recharger**
   l'écran.
3. Supprimez-la, une par une, puis testez « tout effacer ».
4. Si l'étape 2 est faite : ajoutez une photo **depuis le téléphone** et vérifiez
   qu'elle arrive sur l'écran de la salle (celui-ci relit le bucket toutes les
   minutes).

## D. L'écran d'accueil n'a plus de boutons

Ouvrez `/display` : plus aucun contrôle, il fait face à la salle. Tout se pilote
depuis la première page.

---

# Si quelque chose ne va pas

| Symptôme                                               | Cause la plus probable                                                                    |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Je confirme au téléphone, l'écran ne bouge pas du tout | `migration-realtime.sql` non exécutée **et** réseau coupé                                 |
| L'écran réagit, mais toujours avec ~4 s de retard      | `migration-realtime.sql` non exécutée (la relecture de secours prend le relais)           |
| Le QR code s'ouvre sur une page introuvable            | `publicBaseUrl` pointe sur `localhost` — étape 3                                          |
| « Invité inconnu » au scan                             | la liste n'était pas encore chargée ; l'app attend jusqu'à 8 s puis abandonne — rescannez |
| La photo du téléphone n'arrive pas sur l'écran         | bucket `slides` absent — étape 2                                                          |
| Le tirage ne propose personne                          | aucun invité à la fois présent, non chrétien et dans l'un des six cercles                 |

---

La migration `supabase/migration-lien-genre.sql` (ajout de `gender`, fusion
Ami/Connaissance) relève d'`amélioration2` mais **conditionne le tirage** de la
partie B. Si elle n'a jamais été passée, exécutez-la avant l'étape 1 — et
relisez ensuite la liste, elle met tous les invités existants à « Homme ».
