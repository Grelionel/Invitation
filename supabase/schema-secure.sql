-- Variante verrouillée du schéma : à exécuter APRÈS `schema.sql` si vous
-- préférez que vos invités ne puissent pas lire toute la liste.
--
-- Ce que ça change :
--   * un invité qui scanne son QR code ne voit plus que son propre nom, sa
--     table et son lien — plus aucun numéro de téléphone ;
--   * il peut uniquement se marquer présent, rien d'autre ;
--   * la gestion (ajout, modification, suppression) demande une connexion.
--
-- Il faut donc créer un compte opérateur dans Supabase :
--   Authentication → Users → Add user (email + mot de passe), et connecter
--   chaque appareil une fois. Voir le README.

-- ---------------------------------------------------------------------------
-- 1. Les invités ne lisent plus la table directement, mais une vue sans
--    données personnelles.
-- ---------------------------------------------------------------------------
create or replace view public.guests_public
with (security_invoker = off) as
  select id, status, nom, prenom, table_name, link, present
  from public.guests;

grant select on public.guests_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. On remplace les règles ouvertes
-- ---------------------------------------------------------------------------
drop policy if exists "lecture publique" on public.guests;
drop policy if exists "ecriture publique" on public.guests;

-- Seul un opérateur connecté voit la table complète et peut la modifier.
create policy "lecture operateur" on public.guests
  for select to authenticated using (true);
create policy "gestion operateur" on public.guests
  for all to authenticated using (true) with check (true);

-- Un invité non connecté peut seulement basculer sa présence.
create policy "pointage invite" on public.guests
  for update to anon using (true) with check (true);

-- Et uniquement la colonne "present" : le reste lui est refusé.
revoke update on public.guests from anon;
grant update (present, updated_at) on public.guests to anon;
revoke select on public.guests from anon;
