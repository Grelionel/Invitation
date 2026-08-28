import { describe, expect, it } from 'vitest';

import type { GuestDraft } from '../models/guest';
import type { WeddingTable } from '../models/wedding-table';
import {
  type GuestRow,
  type WeddingTableRow,
  toCheckedInAt,
  toGuest,
  toRow,
  toWeddingTable,
} from './supabase-row';

const TABLE: WeddingTable = { id: 19, name: 'Ésaïe 54:5', seatLimit: 10 };
const BY_ID = new Map([[TABLE.id, TABLE]]);
const BY_NAME = new Map([[TABLE.name, TABLE]]);

const ROW: GuestRow = {
  id: 5,
  status: 'Couple',
  nom: 'OYANANDINGUI',
  prenom: 'Philipp',
  wedding_table_id: 19,
  link: 'Église',
  gender: 'Femme',
  is_christian: 'Oui',
  phone: '+24177395411',
  seats: 2,
  checked_in_at: '2026-08-28T18:30:00.000Z',
  present: true,
};

const DRAFT: GuestDraft = {
  status: 'Couple',
  nom: 'OYANANDINGUI',
  prenom: 'Philipp',
  table: 'Ésaïe 54:5',
  link: 'Église',
  gender: 'Femme',
  isChristian: 'Oui',
  phone: '+24177395411',
};

describe('toWeddingTable', () => {
  it('renames the seat limit to the app spelling', () => {
    const row: WeddingTableRow = { id: 19, name: 'Ésaïe 54:5', seat_limit: 8 };
    expect(toWeddingTable(row)).toEqual({ id: 19, name: 'Ésaïe 54:5', seatLimit: 8 });
  });
});

describe('toGuest', () => {
  it('names the table the foreign key points at', () => {
    expect(toGuest(ROW, BY_ID).table).toBe('Ésaïe 54:5');
  });

  it('keeps accented values intact', () => {
    expect(toGuest(ROW, BY_ID).link).toBe('Église');
  });

  it('carries the gender the raffle sorts on', () => {
    expect(toGuest(ROW, BY_ID).gender).toBe('Femme');
    expect(toRow(DRAFT, BY_NAME).gender).toBe('Femme');
  });

  it('reads presence from the generated column', () => {
    expect(toGuest(ROW, BY_ID).present).toBe(true);
    expect(toGuest({ ...ROW, checked_in_at: null, present: false }, BY_ID).present).toBe(false);
  });

  it('leaves the table blank rather than throwing on an unknown id', () => {
    // A half-drawn list beats a blank screen.
    expect(toGuest(ROW, new Map()).table).toBe('');
  });

  it('preserves a guest with no first name', () => {
    const row = { ...ROW, prenom: null, is_christian: null };
    const guest = toGuest(row, BY_ID);
    expect(guest.prenom).toBeNull();
    expect(guest.isChristian).toBeNull();
  });
});

describe('toRow', () => {
  it('resolves the table name to its foreign key', () => {
    expect(toRow(DRAFT, BY_NAME).wedding_table_id).toBe(19);
  });

  it('omits the columns Postgres generates or mints', () => {
    const row = toRow(DRAFT, BY_NAME);
    expect(row).not.toHaveProperty('id');
    expect(row).not.toHaveProperty('seats');
    expect(row).not.toHaveProperty('present');
  });

  it('refuses a table the database does not know', () => {
    expect(() => toRow({ ...DRAFT, table: 'Table fantôme' }, BY_NAME)).toThrow(
      'Table « Table fantôme » introuvable',
    );
  });
});

describe('toCheckedInAt', () => {
  it('stamps the hour of arrival when marking someone present', () => {
    const stamp = toCheckedInAt(true);
    expect(stamp).not.toBeNull();
    expect(Number.isNaN(Date.parse(stamp as string))).toBe(false);
  });

  it('clears the stamp when sending a guest back to waiting', () => {
    expect(toCheckedInAt(false)).toBeNull();
  });
});
