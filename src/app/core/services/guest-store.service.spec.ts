import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Guest, GuestDraft } from '../models/guest';
import { MAX_TABLES, TABLE_NAMES } from '../models/wedding.constants';
import { GuestStore } from './guest-store.service';
import { GUESTS_BACKEND } from './guests-backend';
import { LocalStoreService } from './local-store.service';

/** In-memory stand-ins so the store can be exercised without IndexedDB or Supabase. */
class FakeLocalStore {
  readonly entries = new Map<string, unknown>();

  async read<T>(key: string, fallback: T): Promise<T> {
    return this.entries.has(key) ? (this.entries.get(key) as T) : fallback;
  }

  async write(key: string, value: unknown): Promise<void> {
    this.entries.set(key, value);
  }
}

class FakeBackend {
  guests: Guest[] = [];
  readonly replaceAll = vi.fn(async (guests: readonly Guest[]) => {
    this.guests = [...guests];
  });
  readonly fetchAll = vi.fn(async () => this.guests);
  readonly setPresence = vi.fn(async (id: number, present: boolean) => {
    this.guests = this.guests.map((g) => (g.id === id ? { ...g, present } : g));
    const guest = this.guests.find((g) => g.id === id);
    if (!guest) throw new Error(`Invité #${id} introuvable`);
    return guest;
  });
  readonly stop = vi.fn();
  readonly watch = vi.fn(() => this.stop);
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

function setup(backend: FakeBackend | null): { store: GuestStore; local: FakeLocalStore } {
  const local = new FakeLocalStore();
  TestBed.configureTestingModule({
    providers: [
      GuestStore,
      { provide: LocalStoreService, useValue: local },
      { provide: GUESTS_BACKEND, useValue: backend },
    ],
  });
  return { store: TestBed.inject(GuestStore), local };
}

describe('GuestStore with Supabase configured', () => {
  let store: GuestStore;
  let backend: FakeBackend;

  beforeEach(async () => {
    backend = new FakeBackend();
    store = setup(backend).store;
    await store.load();
  });

  it('seeds the Bible-verse tables on first load', () => {
    expect(store.tables()).toEqual([...TABLE_NAMES]);
    expect(store.guests()).toEqual([]);
  });

  it('assigns sequential ids and pushes the list to the database', async () => {
    const first = await store.addGuest(draft());
    const second = await store.addGuest(draft({ nom: 'Gretta' }));

    expect([first.id, second.id]).toEqual([1, 2]);
    expect(backend.replaceAll).toHaveBeenCalledTimes(2);
    expect(backend.guests).toHaveLength(2);
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

  it('checks a guest in without resending the whole list', async () => {
    const guest = await store.addGuest(draft());
    backend.replaceAll.mockClear();

    await store.setPresence(guest.id, true);

    // A device pointing arrivals must not overwrite an edit in progress elsewhere.
    expect(backend.replaceAll).not.toHaveBeenCalled();
    expect(backend.setPresence).toHaveBeenCalledWith(guest.id, true);
    expect(store.guests()[0].present).toBe(true);
    expect(store.stats().present).toBe(1);
  });

  it('sends a guest back to waiting', async () => {
    const guest = await store.addGuest(draft());
    await store.setPresence(guest.id, true);

    await store.setPresence(guest.id, false);

    expect(store.guests()[0].present).toBe(false);
    expect(store.stats().present).toBe(0);
  });

  it('keeps the local list when a check-in cannot reach the database', async () => {
    const guest = await store.addGuest(draft());
    backend.setPresence.mockRejectedValueOnce(new Error('Failed to fetch'));

    await store.setPresence(guest.id, true);

    // The operator is warned by a toast, but the screen still reflects reality.
    expect(store.guests()[0].present).toBe(true);
  });

  it('removes a guest from the list and from the database', async () => {
    const guest = await store.addGuest(draft());
    await store.addGuest(draft({ nom: 'Gretta' }));

    await store.deleteGuest(guest.id);

    expect(store.guests().map((g) => g.nom)).toEqual(['Gretta']);
    expect(backend.guests).toHaveLength(1);
  });
});

describe('GuestStore opening a device that has never seen the list', () => {
  it('adopts the shared list on load', async () => {
    const backend = new FakeBackend();
    backend.guests = [{ ...draft(), id: 7, present: true }];
    const { store, local } = setup(backend);

    await store.load();

    expect(store.guests()).toHaveLength(1);
    expect(store.guests()[0].id).toBe(7);
    // The pulled list is cached so a reload paints before the network answers.
    expect(local.entries.get('weddingGuests')).toHaveLength(1);
  });
});

describe('GuestStore without Supabase', () => {
  let store: GuestStore;
  let local: FakeLocalStore;

  beforeEach(async () => {
    ({ store, local } = setup(null));
    await store.load();
  });

  it('still seeds the tables and persists guests locally', async () => {
    expect(store.tables()).toEqual([...TABLE_NAMES]);

    await store.addGuest(draft());

    expect(local.entries.get('weddingGuests')).toHaveLength(1);
  });

  it('records attendance without a database', async () => {
    const guest = await store.addGuest(draft());

    await store.setPresence(guest.id, true);

    expect(store.stats().present).toBe(1);
    const saved = local.entries.get('weddingGuests') as readonly { present: boolean }[];
    expect(saved[0].present).toBe(true);
  });
});
