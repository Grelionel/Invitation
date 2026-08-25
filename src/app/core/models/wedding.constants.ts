import type { GuestLink, GuestStatus } from './guest';

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
  'Ami',
  'Collègue',
  'Connaissance',
  'Église',
];

export const GUEST_STATUSES: readonly GuestStatus[] = [
  'Couple',
  'Monsieur',
  'Madame',
  'Mademoiselle',
];

export const MAX_GUESTS = 300;
export const MAX_TABLES = 30;
export const MAX_PER_TABLE = 10;

/** Links eligible for the raffle — church guests are excluded by design. */
export const LOTTERY_ELIGIBLE_LINKS: readonly GuestLink[] = [
  'Parent',
  'Ami',
  'Collègue',
  'Connaissance',
];
