-- Variante verrouillée : à exécuter APRÈS `schema.sql` si vous préférez que vos
-- invités ne puissent pas lire toute la liste.
--
-- Ce que ça change :
--   * un invité qui scanne son QR code ne voit plus de numéros de téléphone ;
--   * il peut uniquement enregistrer son arrivée, rien d'autre ;
--   * la gestion (ajout, modification, suppression) demande une connexion.
--
-- Il faut donc créer un compte opérateur dans Supabase :
--   Authentication → Users → Add user (email + mot de passe), puis connecter
--   le PC une fois. Voir le README.

-- ---------------------------------------------------------------------------
-- 1. Une vue sans données personnelles pour les invités
-- ---------------------------------------------------------------------------
-- `security_invoker = off` : la vue s'exécute avec les droits de son
-- propriétaire, donc elle traverse la RLS de la table qu'elle expose. C'est
-- exactement ce qu'on veut ici — la vue EST le filtre.
create or replace view public.guest_public
with (security_invoker = off) as
  select g.id, g.status, g.nom, g.prenom, g.link, g.seats, g.present,
         t.name as table_name
  from public.guest g
  join public.wedding_table t on t.id = g.wedding_table_id;

grant select on public.guest_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. On remplace les règles ouvertes
-- ---------------------------------------------------------------------------
drop policy if exists "invites lecture" on public.guest;
drop policy if exists "invites ajout"   on public.guest;
drop policy if exists "invites edition" on public.guest;
drop policy if exists "invites retrait" on public.guest;
drop policy if exists "tables gestion"  on public.wedding_table;

-- L'opérateur connecté voit et gère tout.
create policy "operateur lecture" on public.guest
  for select to authenticated using (true);
create policy "operateur gestion" on public.guest
  for all to authenticated using (true) with check (true);

create policy "operateur tables" on public.wedding_table
  for all to authenticated using (true) with check (true);

-- L'invité non connecté peut seulement pointer son arrivée.
create policy "pointage invite" on public.guest
  for update to anon using (true) with check (true);

-- Et uniquement l'heure d'arrivée. Sans cette restriction de colonnes, la
-- règle ci-dessus laisserait un invité se changer de table ou modifier un nom.
revoke select, update on public.guest from anon;
grant update (checked_in_at) on public.guest to anon;

-- La liste des tables reste lisible : le QR code affiche où s'asseoir.
-- Elle ne contient rien de personnel.
