import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Gender, Guest, GuestLink } from '../../core/models/guest';
import { LOTTERY_CATEGORIES, TOTAL_PRIZES } from '../../core/models/wedding.constants';
import { GuestStore } from '../../core/services/guest-store.service';
import { GUESTS_BACKEND } from '../../core/services/guests-backend';
import { LocalStoreService } from '../../core/services/local-store.service';
import { LotteryService } from './lottery.service';

/** In-memory stand-in for IndexedDB. */
class FakeLocalStore {
  readonly entries = new Map<string, unknown>();

  async read<T>(key: string, fallback: T): Promise<T> {
    return this.entries.has(key) ? (this.entries.get(key) as T) : fallback;
  }

  async write(key: string, value: unknown): Promise<void> {
    this.entries.set(key, value);
  }
}

let nextId = 1;

function guest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: nextId++,
    status: 'Monsieur',
    nom: `Invité ${nextId}`,
    prenom: 'Test',
    table: 'Jean 3:16',
    link: 'Parent',
    gender: 'Homme',
    isChristian: 'Non',
    phone: null,
    present: true,
    checkedInAt: '2026-09-01T19:00:00.000Z',
    ...overrides,
  };
}

function setup(guests: readonly Guest[]): {
  lottery: LotteryService;
  local: FakeLocalStore;
  store: GuestStore;
} {
  const local = new FakeLocalStore();
  TestBed.configureTestingModule({
    providers: [
      GuestStore,
      LotteryService,
      { provide: LocalStoreService, useValue: local },
      { provide: GUESTS_BACKEND, useValue: null },
    ],
  });
  const store = TestBed.inject(GuestStore);
  // The store keeps its list private; seeding it through the local store is
  // what a device coming back from a reload does anyway.
  local.entries.set('weddingGuests', guests);
  local.entries.set('weddingTables', [{ id: 1, name: 'Jean 3:16', seatLimit: 10 }]);
  return { lottery: TestBed.inject(LotteryService), local, store };
}

function category(link: GuestLink, gender: Gender) {
  return LOTTERY_CATEGORIES.find((c) => c.link === link && c.gender === gender)!;
}

describe('LotteryService', () => {
  beforeEach(() => {
    nextId = 1;
    TestBed.resetTestingModule();
  });

  it('shares out exactly twenty prizes', () => {
    expect(TOTAL_PRIZES).toBe(20);
    expect(LOTTERY_CATEGORIES).toHaveLength(6);
  });

  it('draws nobody from a list where nobody is eligible', async () => {
    const { lottery, store } = setup([
      guest({ isChristian: 'Oui' }),
      guest({ present: false }),
      guest({ link: 'Église' }),
    ]);
    await store.load();
    await lottery.load();

    expect(lottery.drawable()).toHaveLength(0);
    expect(lottery.pick(null)).toBeNull();
  });

  it('only ever draws a guest who is present and not Christian', async () => {
    const eligible = guest();
    const { lottery, store } = setup([
      eligible,
      guest({ isChristian: 'Oui' }),
      guest({ present: false }),
      guest({ isChristian: null }),
    ]);
    await store.load();
    await lottery.load();

    for (let i = 0; i < 20; i++) {
      expect(lottery.pick(null)?.winner.id).toBe(eligible.id);
    }
  });

  it('keeps the church out of the raffle, whatever the answer on Chrétien', async () => {
    const { lottery, store } = setup([guest({ link: 'Église', gender: 'Femme' })]);
    await store.load();
    await lottery.load();

    expect(lottery.pick(null)).toBeNull();
    expect(lottery.categories().some((state) => state.label.startsWith('Église'))).toBe(false);
  });

  it('draws from the category asked for, and no other', async () => {
    const father = guest({ link: 'Parent', gender: 'Homme' });
    const colleague = guest({ link: 'Collègue', gender: 'Femme' });
    const { lottery, store } = setup([father, colleague]);
    await store.load();
    await lottery.load();

    expect(lottery.pick('Collègue (Femme)')?.winner.id).toBe(colleague.id);
    expect(lottery.pick('Parent (Homme)')?.winner.id).toBe(father.id);
    expect(lottery.pick('Parent (Femme)')).toBeNull();
  });

  it('stops a category once its prizes are gone', async () => {
    const guests = [1, 2, 3, 4, 5].map(() => guest({ link: 'Collègue', gender: 'Homme' }));
    const { lottery, store } = setup(guests);
    await store.load();
    await lottery.load();

    // Three gifts for this circle, five people in the room.
    for (let i = 0; i < 3; i++) {
      const drawn = lottery.pick('Collègue (Homme)');
      await lottery.record(drawn!.winner, drawn!.state.category);
    }

    expect(lottery.pick('Collègue (Homme)')).toBeNull();
    expect(lottery.prizesLeft()).toBe(TOTAL_PRIZES - 3);
  });

  it('never gives two gifts to the same guest', async () => {
    const first = guest({ link: 'Parent', gender: 'Femme' });
    const second = guest({ link: 'Parent', gender: 'Femme' });
    const { lottery, store } = setup([first, second]);
    await store.load();
    await lottery.load();

    const drawn = lottery.pick('Parent (Femme)')!;
    await lottery.record(drawn.winner, drawn.state.category);

    // Four gifts are left in this circle, but only one guest who has none.
    const other = lottery.pick('Parent (Femme)')!;
    expect(other.winner.id).not.toBe(drawn.winner.id);

    await lottery.record(other.winner, other.state.category);
    expect(lottery.pick('Parent (Femme)')).toBeNull();
  });

  it('remembers the winners across a reload, and forgets them on a reset', async () => {
    const only = guest();
    const { lottery, local, store } = setup([only]);
    await store.load();
    await lottery.load();

    await lottery.record(only, category('Parent', 'Homme'));
    expect(local.entries.get('weddingLotteryWinners')).toHaveLength(1);
    expect(lottery.winners()[0].name).toContain('INVITÉ');

    await lottery.reset();
    expect(lottery.winners()).toHaveLength(0);
    expect(lottery.prizesLeft()).toBe(TOTAL_PRIZES);
  });
});
