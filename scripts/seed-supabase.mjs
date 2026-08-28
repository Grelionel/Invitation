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

const base = `${url.replace(/\/+$/, '')}/rest/v1`;
const headers = { apikey: key, Authorization: `Bearer ${key}` };

async function read(path, hint) {
  const response = await fetch(`${base}/${path}`, { headers });
  if (response.ok) return response.json();
  console.error(`Lecture impossible (HTTP ${response.status}):`, await response.text());
  console.error(hint);
  process.exit(1);
}

// La liste en ligne fait foi le jour J : on ne l'écrase pas par accident.
const existing = await read('guest?select=id', 'Avez-vous exécuté supabase/schema.sql ?');
if (existing.length > 0 && !process.argv.includes('--force')) {
  console.error(
    `La base contient déjà ${existing.length} invité(s). ` +
      'Relancez avec --force pour les remplacer.',
  );
  process.exit(1);
}

// La table de la salle est une entité à part entière : le fichier la nomme,
// la base l'identifie. Le schéma sème les 30 passages bibliques, donc chaque
// nom devrait déjà s'y trouver.
const tables = await read(
  'wedding_table?select=id,name',
  'La table wedding_table est-elle bien créée ?',
);
const idByName = new Map(tables.map((table) => [table.name, table.id]));

const unknown = [...new Set(guests.map((guest) => guest.table))].filter(
  (name) => !idByName.has(name),
);
if (unknown.length > 0) {
  console.error(`Tables absentes de la base : ${unknown.join(', ')}`);
  console.error('Ajoutez-les dans wedding_table avant de relancer.');
  process.exit(1);
}

// `id`, `seats` et `present` sont mintés ou calculés par Postgres : les
// envoyer serait refusé. La présence passe par l'heure d'arrivée.
const now = new Date().toISOString();
const rows = guests.map((guest) => ({
  status: guest.status,
  nom: guest.nom,
  prenom: guest.prenom ?? null,
  wedding_table_id: idByName.get(guest.table),
  link: guest.link,
  is_christian: guest.isChristian ?? null,
  phone: guest.phone ?? null,
  checked_in_at: guest.present ? now : null,
}));

if (process.argv.includes('--force') && existing.length > 0) {
  const wipe = await fetch(`${base}/guest?id=gte.0`, { method: 'DELETE', headers });
  if (!wipe.ok) {
    console.error(`Suppression impossible (HTTP ${wipe.status}):`, await wipe.text());
    process.exit(1);
  }
}

const response = await fetch(`${base}/guest`, {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify(rows),
});

if (!response.ok) {
  console.error(`Échec (HTTP ${response.status}):`, await response.text());
  // Le trigger de capacité refuse un envoi qui dépasse le nombre de couverts.
  console.error('Une table dépasse-t-elle sa capacité ?');
  process.exit(1);
}
console.log(`${rows.length} invité(s) envoyés vers ${url}`);
