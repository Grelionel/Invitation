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
 * Laissez les deux champs vides pour travailler sans base : chaque navigateur
 * garde alors sa propre liste, sans rien partager.
 */
export const environment = {
  /**
   * Adresse publique du site, telle qu'elle doit apparaître dans les QR codes
   * des billets.
   *
   * Laissez vide pour utiliser l'adresse de la page en cours : c'est le bon
   * réglage une fois le site déployé. Renseignez-la si vous imprimez les
   * billets depuis `localhost`, sinon les QR codes pointeront vers le PC de
   * saisie et aucun téléphone ne pourra les ouvrir.
   */
  publicBaseUrl: '',
  supabaseUrl: 'https://zagzjgrlomjphlcakafi.supabase.co',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphZ3pqZ3Jsb21qcGhsY2FrYWZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5MDc4NzgsImV4cCI6MjEwMzQ4Mzg3OH0.A3yaGJEDttwrr0WOA8tE2INNT3wo6h1NzN4jp9BGU94',
};

/** L'application n'utilise Supabase que si les deux valeurs sont renseignées. */
export function isSupabaseConfigured(): boolean {
  return environment.supabaseUrl.length > 0 && environment.supabaseAnonKey.length > 0;
}

/**
 * L'URL de l'API, en tolérant la référence seule du projet.
 *
 * Le tableau de bord affiche les deux — « Project ID » et « Project URL » — et
 * `createClient` n'accepte que la seconde. Recopier la mauvaise donnait une
 * connexion qui échouait sans dire pourquoi.
 */
export function supabaseUrl(): string {
  const value = environment.supabaseUrl.trim().replace(/\/+$/, '');
  return value.startsWith('http') ? value : `https://${value}.supabase.co`;
}

/**
 * La base des liens encodés dans les QR codes.
 *
 * `document.baseURI` suit le `<base href>` de la page, donc l'application reste
 * juste si elle est publiée dans un sous-dossier.
 */
export function publicBaseUrl(): string {
  const configured = environment.publicBaseUrl.trim();
  if (configured) return configured.endsWith('/') ? configured : `${configured}/`;
  return document.baseURI;
}
