import { describe, expect, it } from 'vitest';

import { CHECK_IN_PARAM, checkInUrl, qrFileName } from './guest-qr';
import type { Guest } from './guest';

const BASE = 'https://mariage.example.com/';

function guest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: 7,
    status: 'Monsieur',
    nom: 'Balondzit',
    prenom: 'Dan',
    table: 'Ésaïe 54:5',
    link: 'Ami / Connaissance',
    gender: 'Homme',
    isChristian: 'Non',
    phone: null,
    present: false,
    checkedInAt: null,
    ...overrides,
  };
}

describe('checkInUrl', () => {
  it('points at the guest list, on the guest that was scanned', () => {
    const url = new URL(checkInUrl(guest(), BASE));

    expect(url.origin).toBe('https://mariage.example.com');
    expect(url.searchParams.get(CHECK_IN_PARAM)).toBe('7');
  });

  it('carries the name and the table, so a printed ticket says something', () => {
    const url = new URL(checkInUrl(guest(), BASE));

    expect(url.searchParams.get('nom')).toBe('BALONDZIT');
    expect(url.searchParams.get('prenom')).toBe('Dan');
    expect(url.searchParams.get('table')).toBe('Ésaïe 54:5');
  });

  it('leaves out the first name of a couple, invited under one name', () => {
    const url = new URL(checkInUrl(guest({ status: 'Couple', prenom: 'Dan' }), BASE));

    expect(url.searchParams.has('prenom')).toBe(false);
  });

  it('follows the site into a sub-folder', () => {
    const url = checkInUrl(guest(), 'https://example.com/mariage/');

    expect(url.startsWith('https://example.com/mariage/?')).toBe(true);
  });
});

describe('qrFileName', () => {
  it('names the file after the guest, without accents or spaces', () => {
    expect(qrFileName(guest({ nom: 'Oyanandingui', prenom: 'Épiphanie' }))).toBe(
      'invitation-07-oyanandingui-epiphanie.png',
    );
  });

  it('drops the first name for a couple', () => {
    expect(qrFileName(guest({ status: 'Couple', nom: 'Mubaghu-Lundu' }))).toBe(
      'invitation-07-mubaghu-lundu.png',
    );
  });
});
