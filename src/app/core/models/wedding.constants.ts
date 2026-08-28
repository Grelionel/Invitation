import type { Gender, GuestLink, GuestStatus } from './guest';

/** Tables are named after Bible verses rather than numbered. */
export const TABLE_NAMES: readonly string[] = [
  'Genèse 2:24',
  'Matthieu 19:5',
  'Marc 10:9',
  'Jean 15:12',
  '1 Corinthiens 13:4-8',
  'Éphésiens 5:25',
  'Colossiens 3:14',
  '1 Jean 4:7',
  'Romains 12:10',
  '1 Pierre 4:8',
  'Proverbes 18:22',
  'Cantique 8:6',
  'Jean 3:16',
  'Philippiens 4:7',
  'Galates 5:22',
  'Romains 15:13',
  'Psaumes 128:3',
  'Proverbes 31:10',
  'Ésaïe 54:5',
  'Osée 2:19',
  'Jean 14:27',
  'Matthieu 5:9',
  'Romains 8:28',
  'Jérémie 29:11',
  'Psaumes 37:4',
  'Philippiens 4:13',
  'Hébreux 11:1',
  'Jacques 1:2',
  '1 Pierre 1:8',
  'Psaumes 16:11',
];

export const GUEST_LINKS: readonly GuestLink[] = [
  'Parent',
  'Église',
  'Ami / Connaissance',
  'Collègue',
];

export const GENDERS: readonly Gender[] = ['Homme', 'Femme'];

/** A link and a gender, as the form offers them: one list of eight entries. */
export interface GuestLinkOption {
  readonly link: GuestLink;
  readonly gender: Gender;
  /** What the `<option>` carries, since a select value is a single string. */
  readonly value: string;
  readonly label: string;
}

export const GUEST_LINK_OPTIONS: readonly GuestLinkOption[] = GENDERS.flatMap((gender) =>
  GUEST_LINKS.map((link) => ({
    link,
    gender,
    value: `${link}|${gender}`,
    label: `${link} (${gender})`,
  })),
);

export const GUEST_STATUSES: readonly GuestStatus[] = [
  'Couple',
  'Monsieur',
  'Madame',
  'Mademoiselle',
];

export const MAX_GUESTS = 300;
export const MAX_TABLES = 30;
/**
 * Covers a new table gets by default.
 *
 * The database owns the real limit, one per table — nothing says every table in
 * the room seats the same number. This is only the value the app proposes.
 */
export const MAX_PER_TABLE = 10;

/**
 * How the twenty door prizes are shared out.
 *
 * The raffle is not one pot: each circle has its own count, so a table full of
 * cousins cannot walk away with every gift. Church guests appear nowhere here —
 * they are excluded by design, as are the guests who answered « Chrétien: Oui ».
 */
export interface PrizeCategory {
  readonly link: GuestLink;
  readonly gender: Gender;
  readonly prizes: number;
}

export const LOTTERY_CATEGORIES: readonly PrizeCategory[] = [
  { link: 'Parent', gender: 'Homme', prizes: 4 },
  { link: 'Ami / Connaissance', gender: 'Homme', prizes: 3 },
  { link: 'Collègue', gender: 'Homme', prizes: 3 },
  { link: 'Parent', gender: 'Femme', prizes: 4 },
  { link: 'Ami / Connaissance', gender: 'Femme', prizes: 3 },
  { link: 'Collègue', gender: 'Femme', prizes: 3 },
];

export const TOTAL_PRIZES = LOTTERY_CATEGORIES.reduce((total, c) => total + c.prizes, 0);
