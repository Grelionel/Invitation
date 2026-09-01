-- Les photos du diaporama, dans Supabase Storage.
--
-- À coller dans Supabase → SQL Editor → New query, puis exécuter une fois.
-- Réexécutable sans risque.
--
-- Pourquoi : jusqu'ici les photos ajoutées le soir même vivaient dans
-- l'IndexedDB du navigateur qui les avait choisies. C'est privé à cet appareil :
-- une photo prise au téléphone ne pouvait pas atteindre la machine branchée au
-- vidéoprojecteur. Un bucket, lui, est lisible par les trois.
--
-- L'application se passe du bucket si vous ne créez pas celui-ci : elle
-- retombe alors sur le stockage local, comme avant.

-- ---------------------------------------------------------------------------
-- 1. Le bucket
-- ---------------------------------------------------------------------------
-- `public` : les fichiers sont lisibles par URL, sans jeton ni expiration.
-- C'est ce qui permet à l'écran de la salle d'afficher une photo dans une
-- balise <img> toute simple, et c'est la même posture que le reste de la base
-- (voir la section « Sécurité » du README) : personne d'autre que vous n'est
-- censé connaître l'adresse du site.
insert into storage.buckets (id, name, public)
  values ('slides', 'slides', true)
  on conflict (id) do update set public = true;

-- ---------------------------------------------------------------------------
-- 2. Les règles d'accès
-- ---------------------------------------------------------------------------
-- La lecture publique vient du bucket lui-même ; l'ajout et la suppression
-- demandent une règle, sans quoi l'application ne peut rien déposer.
--
-- Elles sont séparées par opération, comme celles de la liste des invités : la
-- suppression reste une décision distincte et non un effet de bord.
drop policy if exists "diaporama lecture"     on storage.objects;
drop policy if exists "diaporama ajout"       on storage.objects;
drop policy if exists "diaporama suppression" on storage.objects;

create policy "diaporama lecture" on storage.objects
  for select using (bucket_id = 'slides');

create policy "diaporama ajout" on storage.objects
  for insert with check (bucket_id = 'slides');

create policy "diaporama suppression" on storage.objects
  for delete using (bucket_id = 'slides');

-- Vérification : le bucket doit apparaître, et ses trois règles avec lui.
select id, public from storage.buckets where id = 'slides';
select policyname, cmd from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname like 'diaporama%'
  order by policyname;
