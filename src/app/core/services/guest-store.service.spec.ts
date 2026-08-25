import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Guest, GuestDraft } from '../models/guest';
import { MAX_TABLES, TABLE_NAMES } from '../models/wedding.constants';
import { GuestStore } from './guest-store.service';
import { GuestsApiService } from './guests-api.service';
import { LocalStoreService } from './local-store.service';

/** In-memory stand-ins so the store can be exercised without IndexedDB or a server. */
class FakeLocalStore {
  readonly entries = new Map<string, unknown>();

  async read<T>(key: string, fallback: T): Promise<T> {
    return this.entries.has(key) ? (this.entries.get(key) as T) : fallback;
  }

  async write(key: string, value: unknown): Promise<void> {
    this.entries.set(key, value);
  }
}

class FakeApi {
  guests: Guest[] = [];
  readonly replaceAll = vi.fn(async (guests: readonly Guest[]) => {
    this.guests = [...guests];
  });
  readonly fetchAll = vi.fn(async () => this.guests);
}

function draft(overrides: Partial<GuestDraft> = {}): GuestDraft {
  return {
    status: 'Monsieur',
    nom: 'Dintengou',
    prenom: 'Epiphanie',
    table: TABLE_NAMES[0],
    link: 'Ami',
    isChristian: 'Non',
    phone: null,
    ...overrides,
  };
}

describe('GuestStore', () => {
  let store: GuestStore;
  let api: FakeApi;

  beforeEach(async () => {
    api = new FakeApi();
    TestBed.configureTestingModule({
      providers: [
        GuestStore,
        { provide: LocalStoreService, useClass: FakeLocalStore },
        { provide: GuestsApiService, useValue: api },
      ],
    });
    store = TestBed.inject(GuestStore);
    await store.load();
  });

  it('seeds the Bible-verse tables on first load', () => {
    expect(store.tables()).toEqual([...TABLE_NAMES]);
    expect(store.guests()).toEqual([]);
  });

  it('assigns sequential ids and pushes the list to the server', async () => {
    const first = await store.addGuest(draft());
    const second = await store.addGuest(draft({ nom: 'Gretta' }));

    expect([first.id, second.id]).toEqual([1, 2]);
    expect(api.replaceAll).toHaveBeenCalledTimes(2);
    expect(api.guests).toHaveLength(2);
  });

  it('counts a couple as two seats', async () => {
    await store.addGuest(draft({ status: 'Couple' }));
    await store.addGuest(draft({ status: 'Madame' }));

    expect(store.stats().seats).toBe(3);
    expect(store.stats().couples).toBe(1);
  });

  it('reports capacity as a share of every table being full', async () => {
    await store.addGuest(draft({ status: 'Couple' }));
    // 2 seats out of 30 tables x 10 seats = 0.67%, rounded to 1%.
    expect(store.stats().capacityPercent).toBe(1);
  });

  it('flags a table booked beyond ten seats', async () => {
    for (let i = 0; i < 6; i++) {
      await store.addGuest(draft({ status: 'Couple', nom: `Invité ${i}` }));
    }

    expect(store.overCapacityTables()).toEqual([[TABLE_NAMES[0], 12]]);
  });

  it('sorts guests by full name, ignoring case and accents', async () => {
    await store.addGuest(draft({ nom: 'Zola', prenom: 'Ana' }));
    await store.addGuest(draft({ nom: 'ébène', prenom: 'Luc' }));
    await store.addGuest(draft({ nom: 'Abou', prenom: 'Zoe' }));

    expect(store.sortedGuests().map((g) => g.nom)).toEqual(['Abou', 'ébène', 'Zola']);
  });

  it('rejects a duplicate table without adding it', async () => {
    const error = await store.addTable(TABLE_NAMES[0]);

    expect(error).toBe('Cette table existe déjà');
    expect(store.tables()).toHaveLength(TABLE_NAMES.length);
  });

  it('refuses to add a table past the venue limit', async () => {
    for (let i = store.tables().length; i < MAX_TABLES; i++) {
      expect(await store.addTable(`Table ${i}`)).toBeNull();
    }

    expect(await store.addTable('Une de trop')).toBe(`Maximum ${MAX_TABLES} tables atteint`);
  });

  it('rethrows when a check-in cannot reach the server', async () => {
    const guest = await store.addGuest(draft());
    api.replaceAll.mockRejectedValueOnce(new Error('Failed to fetch'));

    await expect(store.setPresence(guest.id, true)).rejects.toThrow('Failed to fetch');
  });

  it('marks a guest present and shares the change', async () => {
    const guest = await store.addGuest(draft());

    const updated = await store.setPresence(guest.id, true);

    expect(updated.present).toBe(true);
    expect(store.stats().present).toBe(1);
    expect(api.guests[0].present).toBe(true);
  });

  it('adopts the server list on sync', async () => {
    api.guests = [{ ...draft(), id: 7, present: true }];

    await store.syncFromServer(true);

    expect(store.guests()).toHaveLength(1);
    expect(store.guests()[0].id).toBe(7);
  });
});
