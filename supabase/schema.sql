-- Schéma de la base Supabase. Fichier unique : tout est ici, structure et
-- règles d'accès comprises.
--
-- À coller dans Supabase → SQL Editor → New query, puis exécuter une fois.
-- Ce fichier est réexécutable sans risque tant qu'il n'y a pas de données.
--
-- Deux entités : la table de la salle (le passage biblique) et l'invité.
-- La première n'existait pas dans la version précédente — le nom de la table
-- était recopié en texte libre dans chaque invité, ce qui autorisait les fautes
-- de frappe et rendait tout renommage impossible.

-- ---------------------------------------------------------------------------
-- 1. Les tables de la salle
-- ---------------------------------------------------------------------------
create table if not exists public.wedding_table (
  id          integer generated always as identity primary key,
  -- Le passage biblique identifie la table : c'est ce que voient les invités.
  name        text    not null unique,
  -- Le nombre de couverts appartient à la table, pas à l'application : toutes
  -- les tables n'ont pas forcément la même taille.
  seat_limit  smallint not null default 10 check (seat_limit > 0),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Les invités
-- ---------------------------------------------------------------------------
create table if not exists public.guest (
  -- Minté par la base. L'ancien schéma laissait l'application calculer
  -- max(id) + 1, ce qui donne le même identifiant à deux invités si le PC et
  -- le téléphone en ajoutent au même moment.
  id            integer generated always as identity primary key,

  status        text not null check (status in ('Couple','Monsieur','Madame','Mademoiselle')),
  nom           text not null check (length(trim(nom)) > 0),
  -- Null = sans objet : un couple s'affiche sous son seul nom de famille.
  prenom        text,

  wedding_table_id integer not null references public.wedding_table(id) on delete restrict,

  -- Le cercle d'où vient l'invité. « Ami » et « Connaissance » ne font qu'un :
  -- personne ne savait où placer la limite au moment de la saisie, et le
  -- tirage au sort attribue ses lots au cercle entier.
  link          text not null check (link in ('Parent','Église','Ami / Connaissance','Collègue')),
  -- Le tirage au sort répartit ses vingt lots entre hommes et femmes ; la
  -- colonne existe donc pour tous les invités, y compris ceux de l'Église qui
  -- n'y participent pas.
  gender        text not null check (gender in ('Homme','Femme')),
  -- Null = non renseigné, et donc non éligible au tirage au sort.
  is_christian  text check (is_christian in ('Oui','Non')),
  phone         text,

  -- La règle « un couple occupe deux couverts » vivait uniquement dans le code
  -- TypeScript. Ici la base la calcule, donc les deux ne peuvent plus diverger.
  seats         smallint generated always as (case when status = 'Couple' then 2 else 1 end) stored,

  -- Null = pas encore arrivé. Remplace l'ancien booléen `present`, qui écrasait
  -- l'heure d'arrivée : l'écran d'accueil devait deviner les nouveaux arrivants
  -- en comparant deux états successifs.
  checked_in_at timestamptz,
  present       boolean generated always as (checked_in_at is not null) stored,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists guest_wedding_table_id_idx on public.guest (wedding_table_id);
-- L'écran d'accueil ne demande que « qui est arrivé depuis telle heure ».
create index if not exists guest_checked_in_at_idx on public.guest (checked_in_at desc nulls last);

-- ---------------------------------------------------------------------------
-- 3. Ce que la base tient toute seule
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists guest_touch_updated_at on public.guest;
create trigger guest_touch_updated_at
  before update on public.guest
  for each row execute function public.touch_updated_at();

-- La capacité dépend des autres lignes de la même table, ce qu'une contrainte
-- de colonne ne sait pas exprimer. Vérifier côté application ne suffit plus :
-- deux appareils peuvent ajouter le dernier couvert au même instant.
create or replace function public.enforce_table_capacity() returns trigger
language plpgsql as $$
declare
  taken integer;
  allowed integer;
  table_name text;
begin
  select t.seat_limit, t.name into allowed, table_name
    from public.wedding_table t where t.id = new.wedding_table_id
    for update;                     -- sérialise les ajouts sur la même table

  select coalesce(sum(g.seats), 0) into taken
    from public.guest g
    where g.wedding_table_id = new.wedding_table_id
      and g.id is distinct from new.id;

  if taken + (case when new.status = 'Couple' then 2 else 1 end) > allowed then
    raise exception 'La table % est pleine (% / % couverts)', table_name, taken, allowed
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists guest_enforce_capacity on public.guest;
create trigger guest_enforce_capacity
  before insert or update of wedding_table_id, status on public.guest
  for each row execute function public.enforce_table_capacity();

-- ---------------------------------------------------------------------------
-- 4. Les 30 tables par défaut
-- ---------------------------------------------------------------------------
insert into public.wedding_table (name) values
  ('Genèse 2:24'), ('Matthieu 19:5'), ('Marc 10:9'), ('Jean 15:12'),
  ('1 Corinthiens 13:4-8'), ('Éphésiens 5:25'), ('Colossiens 3:14'),
  ('1 Jean 4:7'), ('Romains 12:10'), ('1 Pierre 4:8'),
  ('Proverbes 18:22'), ('Cantique 8:6'), ('Jean 3:16'),
  ('Philippiens 4:7'), ('Galates 5:22'), ('Romains 15:13'),
  ('Psaumes 128:3'), ('Proverbes 31:10'), ('Ésaïe 54:5'),
  ('Osée 2:19'), ('Jean 14:27'), ('Matthieu 5:9'),
  ('Romains 8:28'), ('Jérémie 29:11'), ('Psaumes 37:4'),
  ('Philippiens 4:13'), ('Hébreux 11:1'), ('Jacques 1:2'),
  ('1 Pierre 1:8'), ('Psaumes 16:11')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- 5. Le direct
-- ---------------------------------------------------------------------------
-- `alter publication ... add table` échoue si la table y est déjà, d'où le test.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'guest'
  ) then
    alter publication supabase_realtime add table public.guest;
  end if;

  -- Les tables de la salle aussi : une table ajoutée depuis le PC doit
  -- apparaître sur le téléphone sans recharger la page.
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wedding_table'
  ) then
    alter publication supabase_realtime add table public.wedding_table;
  end if;
end $$;

alter table public.guest         replica identity full;
alter table public.wedding_table replica identity full;

-- ---------------------------------------------------------------------------
-- 6. Les règles d'accès
-- ---------------------------------------------------------------------------
alter table public.guest          enable row level security;
alter table public.wedding_table  enable row level security;

drop policy if exists "lecture publique"  on public.guest;
drop policy if exists "ecriture publique" on public.guest;
drop policy if exists "invites lecture"   on public.guest;
drop policy if exists "invites ajout"     on public.guest;
drop policy if exists "invites edition"   on public.guest;
drop policy if exists "invites retrait"   on public.guest;
drop policy if exists "tables lecture"    on public.wedding_table;
drop policy if exists "tables gestion"    on public.wedding_table;

-- ATTENTION — voir la section « Sécurité » du README.
--
-- L'application n'a pas d'écran de connexion : elle parle à la base avec la
-- clé « anon », publique par conception. Ces règles ouvrent donc la base à
-- quiconque connaît l'URL du site — lecture ET écriture de la liste entière,
-- numéros de téléphone compris.
--
-- C'est un choix assumé : personne d'autre que vous n'est censé avoir l'URL,
-- et le jour du mariage compte plus qu'un mot de passe à retrouver. Ne publiez
-- pas l'adresse, et videz la base une fois la fête passée.
--
-- Une variante verrouillée derrière un compte opérateur a existé
-- (`supabase/schema-secure.sql`, commit de4217c) ; elle demandait un écran de
-- connexion que l'application n'a pas.
--
-- Les droits sont séparés par opération plutôt qu'en un seul « for all » :
-- la suppression est ainsi une décision distincte, et non un effet de bord.
create policy "invites lecture" on public.guest for select using (true);
create policy "invites ajout"   on public.guest for insert with check (true);
create policy "invites edition" on public.guest for update using (true) with check (true);
create policy "invites retrait" on public.guest for delete using (true);

create policy "tables lecture"  on public.wedding_table for select using (true);
create policy "tables gestion"  on public.wedding_table for all using (true) with check (true);
