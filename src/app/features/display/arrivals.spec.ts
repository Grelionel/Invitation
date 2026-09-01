import { describe, expect, it } from 'vitest';

import type { Guest } from '../../core/models/guest';
import { arrivalsToAnnounce } from './arrivals';

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
    checkedInAt: null,
    ...overrides,
  };
}

function arrived(id: number, at: string): Guest {
  return guest({ id, present: true, checkedInAt: at });
}

describe('arrivalsToAnnounce', () => {
  it('announces everyone who arrived since the last look', () => {
    // Two tickets scanned into the same refresh: the screen used to keep the
    // first and silently drop the second.
    const announced = new Set<number>();
    const arrivals = arrivalsToAnnounce(
      [arrived(1, '2026-09-01T19:00:00Z'), arrived(2, '2026-09-01T19:00:02Z')],
      announced,
    );

    expect(arrivals.map((g) => g.id)).toEqual([1, 2]);
  });

  it('welcomes them in the order the door queue formed', () => {
    const arrivals = arrivalsToAnnounce(
      [arrived(1, '2026-09-01T19:05:00Z'), arrived(2, '2026-09-01T19:01:00Z')],
      new Set<number>(),
    );

    expect(arrivals.map((g) => g.id)).toEqual([2, 1]);
  });

  it('puts a guest marked present from the list before the scanned ones', () => {
    const arrivals = arrivalsToAnnounce(
      [arrived(1, '2026-09-01T19:05:00Z'), guest({ id: 2, present: true })],
      new Set<number>(),
    );

    expect(arrivals.map((g) => g.id)).toEqual([2, 1]);
  });

  it('never announces the same guest twice', () => {
    const announced = new Set<number>();
    const guests = [arrived(1, '2026-09-01T19:00:00Z')];

    expect(arrivalsToAnnounce(guests, announced)).toHaveLength(1);
    expect(arrivalsToAnnounce(guests, announced)).toHaveLength(0);
  });

  it('ignores the guests who are still expected', () => {
    const arrivals = arrivalsToAnnounce(
      [guest({ id: 1 }), arrived(2, '2026-09-01T19:00:00Z')],
      new Set(),
    );

    expect(arrivals.map((g) => g.id)).toEqual([2]);
  });

  it('welcomes again a guest put back to waiting and checked in a second time', () => {
    const announced = new Set<number>();
    arrivalsToAnnounce([arrived(1, '2026-09-01T19:00:00Z')], announced);

    // A mis-scan corrected on the list, then the real arrival.
    arrivalsToAnnounce([guest({ id: 1 })], announced);
    const arrivals = arrivalsToAnnounce([arrived(1, '2026-09-01T19:30:00Z')], announced);

    expect(arrivals.map((g) => g.id)).toEqual([1]);
  });

  it('forgets a guest deleted from the list', () => {
    const announced = new Set<number>([1]);

    arrivalsToAnnounce([], announced);

    expect(announced.has(1)).toBe(false);
  });
});
