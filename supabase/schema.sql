-- Schéma de la base Supabase.
--
-- À coller dans Supabase → SQL Editor → New query, puis exécuter une fois.
-- Sans risque à relancer : tout est en "if not exists" / "or replace".

-- ---------------------------------------------------------------------------
-- 1. La table des invités
-- ---------------------------------------------------------------------------
create table if not exists public.guests (
  id            integer primary key,
  status        text    not null,
  nom           text    not null,
  prenom        text,
  table_name    text    not null,
  link          text    not null,
  is_christian  text,
  phone         text,
  present       boolean not null default false,
  updated_at    timestamptz not null default now()
);

-- Les écrans reçoivent les changements en direct (plus de rafraîchissement
-- toutes les 2 secondes).
alter publication supabase_realtime add table public.guests;

-- ---------------------------------------------------------------------------
-- 2. Les règles d'accès
-- ---------------------------------------------------------------------------
-- Sans "row level security", la table est fermée. Avec, ce sont les règles
-- ci-dessous qui décident de ce qui est autorisé.
alter table public.guests enable row level security;

drop policy if exists "lecture publique" on public.guests;
drop policy if exists "ecriture publique" on public.guests;

-- ATTENTION — voir la section « Sécurité » du README.
--
-- Ces règles ouvrent la table à toute personne qui charge le site, donc à tous
-- vos invités : ils peuvent lire la liste complète (numéros de téléphone
-- compris) et la modifier. C'est le réglage le plus simple, pas le plus sûr.
-- Le README explique comment le restreindre.
create policy "lecture publique" on public.guests for select using (true);
create policy "ecriture publique" on public.guests for all using (true) with check (true);
