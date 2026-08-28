/**
 * Envoie `data/guests.json` vers la base Supabase.
 *
 * À lancer une fois, après avoir exécuté `supabase/schema.sql`, pour reprendre
 * les invités déjà saisis au lieu de les retaper.
 *
 *   node scripts/seed-supabase.mjs <url-du-projet> <cle-anon>
 *
 * Les valeurs se trouvent dans Supabase → Project Settings → Data API.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const url = process.argv[2] ?? process.env.SUPABASE_URL;
const key = process.argv[3] ?? process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Usage: node scripts/seed-supabase.mjs <url-du-projet> <cle-anon>');
  process.exit(1);
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const guests = JSON.parse(await readFile(join(root, 'data', 'guests.json'), 'utf8'));
if (!Array.isArray(guests)) {
  console.error('data/guests.json ne contient pas une liste.');
  process.exit(1);
}

const endpoint = `${url.replace(/\/+$/, '')}/rest/v1/guests`;
const headers = { apikey: key, Authorization: `Bearer ${key}` };

// La liste en ligne fait foi le jour J : on ne l'écrase pas par accident.
const existing = await fetch(`${endpoint}?select=id`, { headers });
if (existing.ok) {
  const rows = await existing.json();
  if (rows.length > 0 && !process.argv.includes('--force')) {
    console.error(
      `La base contient déjà ${rows.length} invité(s). ` +
        'Relancez avec --force pour les remplacer.',
    );
    process.exit(1);
  }
} else {
  console.error(`Lecture impossible (HTTP ${existing.status}):`, await existing.text());
  console.error("Avez-vous exécuté supabase/schema.sql dans l'éditeur SQL ?");
  process.exit(1);
}

// Les noms de colonnes diffèrent du modèle : `table` est réservé en SQL.
const rows = guests.map((guest) => ({
  id: guest.id,
  status: guest.status,
  nom: guest.nom,
  prenom: guest.prenom ?? null,
  table_name: guest.table,
  link: guest.link,
  is_christian: guest.isChristian ?? null,
  phone: guest.phone ?? null,
  present: guest.present ?? false,
}));

const response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    ...headers,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates',
  },
  body: JSON.stringify(rows),
});

if (!response.ok) {
  console.error(`Échec (HTTP ${response.status}):`, await response.text());
  process.exit(1);
}
console.log(`${rows.length} invité(s) envoyés vers ${url}`);
