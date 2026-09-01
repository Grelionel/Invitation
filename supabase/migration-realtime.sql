-- Le direct, sur les deux tables.
--
-- À exécuter UNE FOIS dans Supabase → SQL Editor → New query, sur une base
-- créée avant que `schema.sql` ne gagne sa section 5. Réexécutable sans risque.
--
-- Pourquoi : Supabase ne diffuse que les tables inscrites à la publication
-- `supabase_realtime`. Une base où l'inscription n'a jamais été faite accepte
-- l'abonnement sans broncher puis n'envoie jamais rien — le téléphone
-- enregistre l'arrivée, l'écran de la salle ne bouge pas, et rien ne dit
-- pourquoi. C'est exactement le symptôme « je confirme la présence, rien ne se
-- passe ».
--
-- L'application sait désormais se passer du direct : elle relit la liste toutes
-- les quatre secondes. Ce fichier lui rend la réactivité immédiate.

-- `alter publication ... add table` échoue si la table y est déjà, d'où le test.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'guest'
  ) then
    alter publication supabase_realtime add table public.guest;
  end if;

  -- `schema.sql` n'inscrivait que les invités. Ajouter ou supprimer une table
  -- de la salle depuis le PC ne parvenait donc jamais au téléphone.
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wedding_table'
  ) then
    alter publication supabase_realtime add table public.wedding_table;
  end if;
end $$;

-- La réplication logique n'envoie par défaut que la clé primaire de l'ancienne
-- ligne. `full` fait voyager la ligne entière, ce qui rend l'événement lisible
-- tel quel — et sans quoi un filtre côté client ne verrait rien.
alter table public.guest         replica identity full;
alter table public.wedding_table replica identity full;

-- Vérification : les deux lignes doivent apparaître.
select schemaname, tablename
  from pg_publication_tables
  where pubname = 'supabase_realtime' and schemaname = 'public'
  order by tablename;
