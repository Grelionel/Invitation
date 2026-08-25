/**
 * Configuration Supabase.
 *
 * Remplacez les deux valeurs par celles de votre projet :
 * Supabase → Project Settings → Data API (l'URL) et API Keys (la clé « anon »).
 *
 * Cette clé est faite pour vivre dans le code du site : elle est publique et
 * n'ouvre que ce que vos règles d'accès autorisent (voir `supabase/schema.sql`).
 * Ne mettez jamais la clé « service_role » ici.
 *
 * Laissez les deux champs vides pour travailler hors ligne avec le serveur
 * local (`npm run serve`).
 */
export const environment = {
  supabaseUrl: '',
  supabaseAnonKey: '',
};

/** L'application n'utilise Supabase que si les deux valeurs sont renseignées. */
export function isSupabaseConfigured(): boolean {
  return environment.supabaseUrl.length > 0 && environment.supabaseAnonKey.length > 0;
}
