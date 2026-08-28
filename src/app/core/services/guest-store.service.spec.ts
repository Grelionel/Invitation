import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Guest, GuestDraft } from '../models/guest';
import { seatsFor } from '../models/guest';
import type { WeddingTable } from '../models/wedding-table';
import { MAX_TABLES, TABLE_NAMES } from '../models/wedding.constants';
import { GuestStore } from './guest-store.service';
import { GUESTS_BACKEND, type WeddingSnapshot } from './guests-backend';
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

/**
 * Stands in for Postgres, including the parts the store now delegates: it mints
 * the ids and refuses a table booked past its limit.
 */
class FakeBackend {
  tables: WeddingTable[] = TABLE_NAMES.map((name, i) => ({ id: i + 1, name, seatLimit: 10 }));
  guests: Guest[] = [];
  private nextId = 1;

  readonly fetchAll = vi.fn(async (): Promise<WeddingSnapshot> => ({
    tables: this.tables,
    guests: this.guests,
  }));

  readonly addGuest = vi.fn(async (draft: GuestDraft) => {
    this.enforceCapacity(draft, null);
    const guest: Guest = { ...draft, id: this.nextId++, present: false };
    this.guests = [...this.guests, guest];
    return guest;
  });

  readonly updateGuest = vi.fn(async (id: number, draft: GuestDraft) => {
    this.enforceCapacity(draft, id);
    const guest: Guest = { ...draft, id, present: this.find(id).present };
    this.guests = this.guests.map((g) => (g.id === id ? guest : g));
    return guest;
  });

  readonly deleteGuest = vi.fn(async (id: number) => {
    this.guests = this.guests.filter((g) => g.id !== id);
  });

  readonly setPresence = vi.fn(async (id: number, present: boolean) => {
    const guest = { ...this.find(id), present };
    this.guests = this.guests.map((g) => (g.id === id ? guest : g));
    return guest;
  });

  readonly addTable = vi.fn(async (name: string, seatLimit: number) => {
    const table: WeddingTable = { id: this.tables.length + 1, name, seatLimit };
    this.tables = [...this.tables, table];
    return table;
  });

  readonly deleteTable = vi.fn(async (id: number) => {
    if (this.guests.some((g) => g.table === this.tables.find((t) => t.id === id)?.name)) {
      throw new Error('update or delete on table violates foreign key constraint');
    }
    this.tables = this.tables.filter((t) => t.id !== id);
  });

  readonly stop = vi.fn();
  readonly watch = vi.fn(() => this.stop);

  private find(id: number): Guest {
    const guest = this.guests.find((g) => g.id === id);
    if (!guest) throw new Error(`Invité #${id} introuvable`);
    return guest;
  }

  private enforceCapacity(draft: GuestDraft, ignoring: number | null): void {
    const table = this.tables.find((t) => t.name === draft.table);
    if (!table) throw new Error(`Table « ${draft.table} » introuvable`);
    const taken = this.guests
      .filter((g) => g.table === draft.table && g.id !== ignoring)
      .reduce((total, g) => total + seatsFor(g), 0);
    if (taken + seatsFor(draft) > table.seatLimit) {
      throw new Error(`La table ${table.name} est pleine (${taken} / ${table.seatLimit} couverts)`);
    }
  }
}

function draft(overrides: Partial<GuestDraft> = {}): GuestDraft {
  return {
    status: 'Monsieur',
    nom: 'Dintengou',
    prenom: 'Epiphanie',
    table: TABLE_NAMES[0],
    link: 'Ami / Connaissance',
    gender: 'Homme',
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

  it('serves the tables the database owns', () => {
    expect(store.tableNames()).toEqual([...TABLE_NAMES]);
    expect(store.guests()).toEqual([]);
  });

  it('takes the id the database minted rather than computing one', async () => {
    const first = await store.addGuest(draft());
    const second = await store.addGuest(draft({ nom: 'Gretta' }));

    expect([first.id, second.id]).toEqual([1, 2]);
    expect(backend.addGuest).toHaveBeenCalledTimes(2);
  });

  it('never resends the whole list on a write', async () => {
    await store.addGuest(draft());
    await store.setPresence(1, true);
    await store.deleteGuest(1);

    // Each mutation is one row; a blanket rewrite would undo another device.
    expect(backend.addGuest).toHaveBeenCalledTimes(1);
    expect(backend.setPresence).toHaveBeenCalledWith(1, true);
    expect(backend.deleteGuest).toHaveBeenCalledWith(1);
  });

  it('counts a couple as two seats', async () => {
    await store.addGuest(draft({ status: 'Couple' }));
    await store.addGuest(draft({ status: 'Madame' }));

    expect(store.stats().seats).toBe(3);
    expect(store.stats().couples).toBe(1);
  });

  it('reports capacity against the sum of what the tables seat', async () => {
    await store.addGuest(draft({ status: 'Couple' }));
    // 2 seats out of 30 tables x 10 covers = 0.67%, rounded to 1%.
    expect(store.stats().capacityPercent).toBe(1);
  });

  it('leaves the list untouched when the database refuses a full table', async () => {
    for (let i = 0; i < 5; i++) {
      await store.addGuest(draft({ status: 'Couple', nom: `Invité ${i}` }));
    }

    await expect(store.addGuest(draft({ nom: 'De trop' }))).rejects.toThrow('est pleine');
    expect(store.guests()).toHaveLength(5);
    expect(store.stats().seats).toBe(10);
  });

  it('sorts guests by full name, ignoring case and accents', async () => {
    await store.addGuest(draft({ nom: 'Zola', prenom: 'Ana', table: TABLE_NAMES[1] }));
    await store.addGuest(draft({ nom: 'ébène', prenom: 'Luc', table: TABLE_NAMES[2] }));
    await store.addGuest(draft({ nom: 'Abou', prenom: 'Zoe', table: TABLE_NAMES[3] }));

    expect(store.sortedGuests().map((g) => g.nom)).toEqual(['Abou', 'ébène', 'Zola']);
  });

  it('rejects a duplicate table without calling the database', async () => {
    const error = await store.addTable(TABLE_NAMES[0]);

    expect(error).toBe('Cette table existe déjà');
    expect(backend.addTable).not.toHaveBeenCalled();
  });

  it('refuses to add a table past the venue limit', async () => {
    for (let i = store.tables().length; i < MAX_TABLES; i++) {
      expect(await store.addTable(`Table ${i}`)).toBeNull();
    }

    expect(await store.addTable('Une de trop')).toBe(`Maximum ${MAX_TABLES} tables atteint`);
  });

  it('marks a guest present and sends them back to waiting', async () => {
    const guest = await store.addGuest(draft());

    await store.setPresence(guest.id, true);
    expect(store.stats().present).toBe(1);

    await store.setPresence(guest.id, false);
    expect(store.stats().present).toBe(0);
  });

  it('does not show a check-in the database refused', async () => {
    const guest = await store.addGuest(draft());
    backend.setPresence.mockRejectedValueOnce(new Error('Failed to fetch'));

    await expect(store.setPresence(guest.id, true)).rejects.toThrow('Failed to fetch');
    // The caller reports it; the list still shows the database's last word.
    expect(store.guests()[0].present).toBe(false);
  });

  it('removes an empty table', async () => {
    const table = store.tables()[0];

    expect(await store.deleteTable(table.id)).toBeNull();
    expect(store.tableNames()).not.toContain(table.name);
    expect(backend.deleteTable).toHaveBeenCalledWith(table.id);
  });

  it('refuses to remove a table someone is seated at, without asking the database', async () => {
    const table = store.tables()[0];
    await store.addGuest(draft({ table: table.name }));

    const error = await store.deleteTable(table.id);

    // The foreign key would refuse it too, but with a message no host can read.
    expect(error).toContain(table.name);
    expect(backend.deleteTable).not.toHaveBeenCalled();
    expect(store.tableNames()).toContain(table.name);
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
  it('adopts the shared data on load', async () => {
    const backend = new FakeBackend();
    backend.guests = [{ ...draft(), id: 7, present: true }];
    const { store, local } = setup(backend);

    await store.load();

    expect(store.guests()).toHaveLength(1);
    expect(store.guests()[0].id).toBe(7);
    // The pulled data is cached so a reload paints before the network answers.
    expect(local.entries.get('weddingGuests')).toHaveLength(1);
    expect(local.entries.get('weddingTables')).toHaveLength(TABLE_NAMES.length);
  });
});

describe('GuestStore without Supabase', () => {
  let store: GuestStore;
  let local: FakeLocalStore;

  beforeEach(async () => {
    ({ store, local } = setup(null));
    await store.load();
  });

  it('seeds the Bible-verse tables itself', () => {
    expect(store.tableNames()).toEqual([...TABLE_NAMES]);
    expect(store.tables()[0].seatLimit).toBe(10);
  });

  it('mints its own ids and persists guests locally', async () => {
    const first = await store.addGuest(draft());
    const second = await store.addGuest(draft({ nom: 'Gretta' }));

    expect([first.id, second.id]).toEqual([1, 2]);
    expect(local.entries.get('weddingGuests')).toHaveLength(2);
  });

  it('flags a table booked past its limit, since no database refuses it', async () => {
    for (let i = 0; i < 6; i++) {
      await store.addGuest(draft({ status: 'Couple', nom: `Invité ${i}` }));
    }

    const over = store.overCapacityTables();
    expect(over).toHaveLength(1);
    expect(over[0].table.name).toBe(TABLE_NAMES[0]);
    expect(over[0].seats).toBe(12);
  });

  it('records attendance without a database', async () => {
    const guest = await store.addGuest(draft());

    await store.setPresence(guest.id, true);

    expect(store.stats().present).toBe(1);
    const saved = local.entries.get('weddingGuests') as readonly { present: boolean }[];
    expect(saved[0].present).toBe(true);
  });
});
