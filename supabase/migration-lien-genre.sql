-- Migration : le lien devient un couple (cercle, genre).
--
-- À exécuter UNE FOIS, dans Supabase → SQL Editor, sur une base déjà créée avec
-- l'ancien `supabase/schema.sql`. Une base neuve n'en a pas besoin : le schéma
-- complet contient déjà tout ceci.
--
-- Ce que cela change, et pourquoi :
--
--   * « Ami » et « Connaissance » deviennent un seul cercle. Personne ne savait
--     où passait la limite au moment de la saisie, et le tirage au sort attribue
--     ses lots au cercle entier.
--   * Une colonne `gender` apparaît. Les vingt lots sont répartis entre hommes
--     et femmes, ce que l'ancien schéma ne permettait pas d'exprimer.
--
-- ATTENTION — le genre des invités déjà saisis est inconnu de la base. La
-- migration les met tous à « Homme » pour pouvoir poser la contrainte ; c'est un
-- point de départ, pas une vérité. Relisez la liste ensuite, ou corrigez-la en
-- masse avec la requête donnée à la fin.

begin;

-- 1. Les deux cercles n'en font plus qu'un. La contrainte est retirée d'abord :
--    elle refuse la valeur fusionnée tant qu'elle est en place.
alter table public.guest drop constraint if exists guest_link_check;

update public.guest
   set link = 'Ami / Connaissance'
 where link in ('Ami', 'Connaissance');

alter table public.guest
  add constraint guest_link_check
  check (link in ('Parent','Église','Ami / Connaissance','Collègue'));

-- 2. Le genre. La valeur par défaut sert uniquement à remplir les lignes
--    existantes ; elle est retirée ensuite pour que toute nouvelle insertion
--    soit obligée de se prononcer.
alter table public.guest
  add column if not exists gender text not null default 'Homme'
  check (gender in ('Homme','Femme'));

alter table public.guest alter column gender drop default;

commit;

-- 3. À faire à la main, une fois la migration passée : corriger le genre.
--
--    Repérez les lignes à revoir :
--
--      select id, nom, prenom, status, link, gender from public.guest order by nom;
--
--    Puis, par exemple, pour les invitées enregistrées comme Madame ou
--    Mademoiselle — ce que le statut permet de deviner sans risque :
--
--      update public.guest set gender = 'Femme'
--       where status in ('Madame', 'Mademoiselle');
--
--    Les couples et les « Monsieur » restent à « Homme », ce qui correspond à
--    la façon dont les cadeaux sont annoncés le jour J.
