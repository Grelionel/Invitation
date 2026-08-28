import { describe, expect, it } from 'vitest';

import { type Guest, displayName, linkLabel, seatsFor, statusIcon } from './guest';

function guest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: 1,
    status: 'Monsieur',
    nom: 'Balondzit',
    prenom: 'Dan',
    table: 'Jean 3:16',
    link: 'Ami / Connaissance',
    gender: 'Homme',
    isChristian: 'Non',
    phone: null,
    present: false,
    ...overrides,
  };
}

describe('displayName', () => {
  it('shows the family name alone for a couple', () => {
    expect(displayName(guest({ status: 'Couple', nom: 'Mubaghu-Lundu', prenom: 'Grel' }))).toBe(
      'MUBAGHU-LUNDU',
    );
  });

  it('adds the first name for an individual', () => {
    expect(displayName(guest())).toBe('BALONDZIT Dan');
  });

  it('does not leave a trailing space when the first name is missing', () => {
    expect(displayName(guest({ prenom: null }))).toBe('BALONDZIT');
  });
});

describe('linkLabel', () => {
  it('reads back the entry the form offered', () => {
    expect(linkLabel(guest())).toBe('Ami / Connaissance (Homme)');
    expect(linkLabel(guest({ link: 'Parent', gender: 'Femme' }))).toBe('Parent (Femme)');
  });
});

describe('seatsFor', () => {
  it('counts two seats for a couple', () => {
    expect(seatsFor(guest({ status: 'Couple' }))).toBe(2);
  });

  it('counts one seat otherwise', () => {
    expect(seatsFor(guest({ status: 'Madame' }))).toBe(1);
  });
});

describe('statusIcon', () => {
  it('maps every status to an icon', () => {
    expect(statusIcon('Couple')).toBe('fa-heart');
    expect(statusIcon('Madame')).toBe('fa-female');
  });
});
