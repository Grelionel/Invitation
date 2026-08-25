import { describe, expect, it } from 'vitest';

import type { Guest } from '../models/guest';
import { type GuestRow, toGuest, toRow } from './supabase-row';

const GUEST: Guest = {
  id: 5,
  status: 'Couple',
  nom: 'OYANANDINGUI',
  prenom: 'Philipp',
  table: 'Ésaïe 54:5',
  link: 'Église',
  isChristian: 'Oui',
  phone: '+24177395411',
  present: true,
};

const ROW: GuestRow = {
  id: 5,
  status: 'Couple',
  nom: 'OYANANDINGUI',
  prenom: 'Philipp',
  table_name: 'Ésaïe 54:5',
  link: 'Église',
  is_christian: 'Oui',
  phone: '+24177395411',
  present: true,
};

describe('Supabase row mapping', () => {
  it('renames the columns Postgres cannot take verbatim', () => {
    expect(toRow(GUEST)).toEqual(ROW);
  });

  it('round-trips a guest unchanged', () => {
    expect(toGuest(toRow(GUEST))).toEqual(GUEST);
  });

  it('keeps accented values intact', () => {
    expect(toGuest(ROW).table).toBe('Ésaïe 54:5');
    expect(toGuest(ROW).link).toBe('Église');
  });

  it('treats a missing phone column as no phone', () => {
    // The hardened setup serves a view that omits the column entirely.
    const { phone, ...withoutPhone } = ROW;
    expect(toGuest(withoutPhone).phone).toBeNull();
  });

  it('preserves a guest with no first name', () => {
    const couple = { ...GUEST, prenom: null, isChristian: null };
    expect(toGuest(toRow(couple))).toEqual(couple);
  });
});
