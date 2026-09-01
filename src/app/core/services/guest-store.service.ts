import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';

import type { Guest, GuestDraft } from '../models/guest';
import { seatsFor } from '../models/guest';
import type { WeddingTable } from '../models/wedding-table';
import { MAX_PER_TABLE, MAX_TABLES, TABLE_NAMES } from '../models/wedding.constants';
import { GUESTS_BACKEND } from './guests-backend';
import { LocalStoreService } from './local-store.service';
import { ToastService } from './toast.service';

const GUESTS_KEY = 'weddingGuests';
const TABLES_KEY = 'weddingTables';
/** Name of the channel the app's windows use to tell each other about a write. */
const CHANNEL_NAME = 'wedding-store';

/**
 * How often the shared list is re-read while a screen is watching it.
 *
 * The realtime subscription is meant to make this pointless, and on a healthy
 * project it is: the poll finds nothing and costs one small request. It is here
 * because the evening cannot be bet on a socket — a project whose publication
 * never got `public.guest`, a phone down to one bar, a laptop waking from
 * sleep — and because the failure it covers is the one that matters: an
 * arrival scanned at the door that never reaches the hall screen.
 */
const POLL_INTERVAL_MS = 4000;

export interface WeddingStats {
  readonly guests: number;
  readonly tables: number;
  readonly seats: number;
  readonly couples: number;
  readonly present: number;
  readonly capacityPercent: number;
}

/**
 * Single source of truth for guests and tables.
 *
 * Reads are served from IndexedDB first, so the list paints before the network
 * answers and survives a power cut. Writes go to Supabase, which is what lets
 * the laptop, the hall screen and a phone see the same list — a browser's own
 * storage never leaves its device.
 *
 * Every mutation touches a single row. Postgres mints the identifiers and owns
 * the invariants (a full table, a couple counting for two covers), so the store
 * takes what the database returns rather than deciding in its place.
 */
@Injectable({ providedIn: 'root' })
export class GuestStore {
  private readonly local = inject(LocalStoreService);
  private readonly backend = inject(GUESTS_BACKEND);
  private readonly toast = inject(ToastService);

  private readonly guestList = signal<readonly Guest[]>([]);
  private readonly tableList = signal<readonly WeddingTable[]>([]);
  private initialized: Promise<void> | null = null;

  readonly guests = this.guestList.asReadonly();
  readonly tables = this.tableList.asReadonly();

  readonly tableNames = computed(() => this.tableList().map((table) => table.name));

  readonly sortedGuests = computed(() =>
    [...this.guestList()].sort((a, b) =>
      `${a.nom} ${a.prenom ?? ''}`.localeCompare(`${b.nom} ${b.prenom ?? ''}`, 'fr', {
        sensitivity: 'base',
      }),
    ),
  );

  readonly stats = computed<WeddingStats>(() => {
    const guests = this.guestList();
    const tables = this.tableList();
    const seats = guests.reduce((total, guest) => total + seatsFor(guest), 0);
    // Capacity is the sum of what each table seats, not a flat count: the
    // database lets tables differ.
    const capacity = tables.reduce((total, table) => total + table.seatLimit, 0);
    return {
      guests: guests.length,
      tables: tables.length,
      seats,
      couples: guests.filter((g) => g.status === 'Couple').length,
      present: guests.filter((g) => g.present).length,
      capacityPercent: capacity > 0 ? Math.min(Math.round((seats / capacity) * 100), 100) : 0,
    };
  });

  /** Seats booked per table name, used both for warnings and for the picker. */
  readonly occupancy = computed<ReadonlyMap<string, number>>(() => {
    const counts = new Map<string, number>();
    for (const guest of this.guestList()) {
      counts.set(guest.table, (counts.get(guest.table) ?? 0) + seatsFor(guest));
    }
    return counts;
  });

  /** Tables booked past their own limit, carrying the limit they exceeded. */
  readonly overCapacityTables = computed(() => {
    const booked = this.occupancy();
    return this.tableList()
      .map((table) => ({ table, seats: booked.get(table.name) ?? 0 }))
      .filter(({ table, seats }) => seats > table.seatLimit);
  });

  seatsAt(name: string): number {
    return this.occupancy().get(name) ?? 0;
  }

  private watchers = 0;
  private stopWatching: (() => void) | null = null;
  private channel: BroadcastChannel | null = null;
  private pulling: Promise<void> | null = null;
  /** Set once the operator has been told the live connection is down. */
  private realtimeReported = false;

  /**
   * Keeps the list in step with the other screens for as long as the caller
   * lives. Supabase pushes changes made on any device, a poll catches what the
   * socket misses, and the broadcast channel covers the windows of this
   * browser — which is all there is when Supabase has not been configured.
   *
   * Subscriptions are shared, so three screens in one window still cost one
   * connection.
   */
  watch(destroyRef: DestroyRef): void {
    this.watchers++;
    this.stopWatching ??= this.startWatching();

    destroyRef.onDestroy(() => {
      this.watchers--;
      if (this.watchers === 0) {
        this.stopWatching?.();
        this.stopWatching = null;
      }
    });
  }

  private startWatching(): () => void {
    const stopBackend =
      this.backend?.watch(
        () => void this.pull(true),
        (problem) => this.reportRealtimeDown(problem),
      ) ?? null;

    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = () => void this.reloadLocal();
    }

    // Belt and braces, for the reasons given at `POLL_INTERVAL_MS`.
    const poll = this.backend ? setInterval(() => void this.pull(true), POLL_INTERVAL_MS) : null;

    // A phone that has been in a pocket, or a laptop coming back from sleep,
    // has a stale list and a socket that may not have noticed it dropped.
    // Waking up is the moment to catch up, and asking costs one request.
    const onWake = (): void => {
      if (document.visibilityState === 'visible') void this.pull(true);
    };
    if (this.backend) {
      document.addEventListener('visibilitychange', onWake);
      window.addEventListener('focus', onWake);
      window.addEventListener('online', onWake);
    }

    return () => {
      stopBackend?.();
      if (poll !== null) clearInterval(poll);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('online', onWake);
      this.channel?.close();
      this.channel = null;
    };
  }

  /**
   * Says once that the live connection is down.
   *
   * Once, because the client retries on its own and the message would
   * otherwise repeat all evening. The list keeps working — the poll sees to
   * that — so the wording says what is slower rather than what is broken.
   */
  private reportRealtimeDown(problem: string): void {
    if (this.realtimeReported) return;
    this.realtimeReported = true;
    this.toast.error(
      `Mises à jour en direct indisponibles (${problem}). La liste est rafraîchie toutes les ` +
        `${Math.round(POLL_INTERVAL_MS / 1000)} secondes.`,
    );
  }

  /** Announces a write so the other windows of this browser pick it up. */
  private broadcast(): void {
    this.channel?.postMessage('changed');
  }

  /** Loads persisted state once; concurrent callers share the same promise. */
  load(): Promise<void> {
    this.initialized ??= this.loadOnce();
    return this.initialized;
  }

  private async loadOnce(): Promise<void> {
    try {
      const [tables, guests] = await Promise.all([
        this.local.read<readonly WeddingTable[] | null>(TABLES_KEY, null),
        this.local.read<readonly Guest[] | null>(GUESTS_KEY, null),
      ]);
      this.tableList.set(tables ?? seedTables());
      this.guestList.set(guests ?? []);
      if (!tables) await this.local.write(TABLES_KEY, this.tableList());
    } catch (error) {
      this.tableList.set(seedTables());
      this.guestList.set([]);
      this.toast.error(`Erreur de chargement: ${message(error)}`);
    }

    // The cached copy paints immediately; the shared list is what counts.
    await this.pull(false);
  }

  /**
   * Pulls the shared data into the app, and does nothing when it already
   * matches.
   *
   * `background` marks the calls driven by the subscription and by the poll: a
   * change arriving mid-evening is worth announcing, while a network blip is
   * not — the next poll will retry. The initial load is the mirror image:
   * there is no change to announce, but the operator must know when the shared
   * list could not be reached.
   *
   * Calls overlap now that there are three sources of them, so a read already
   * in flight is joined rather than doubled.
   */
  private pull(background: boolean): Promise<void> {
    this.pulling ??= this.pullOnce(background).finally(() => (this.pulling = null));
    return this.pulling;
  }

  private async pullOnce(background: boolean): Promise<void> {
    if (!this.backend) return;
    try {
      const { tables, guests } = await this.backend.fetchAll();
      const changed =
        JSON.stringify(guests) !== JSON.stringify(this.guestList()) ||
        JSON.stringify(tables) !== JSON.stringify(this.tableList());
      if (!changed) return;

      this.guestList.set(guests);
      this.tableList.set(tables);
      await this.cache();
      if (background) this.toast.show('Liste mise à jour', 'info');
    } catch (error) {
      if (!background) {
        this.toast.error(`Liste partagée inaccessible (${message(error)}). Affichage hors ligne.`);
      }
    }
  }

  /** Re-reads IndexedDB after another window of this browser reported a write. */
  private async reloadLocal(): Promise<void> {
    try {
      const [tables, guests] = await Promise.all([
        this.local.read<readonly WeddingTable[] | null>(TABLES_KEY, null),
        this.local.read<readonly Guest[] | null>(GUESTS_KEY, null),
      ]);
      if (tables) this.tableList.set(tables);
      if (guests) this.guestList.set(guests);
    } catch {
      // Ignored on purpose — the next broadcast will try again.
    }
  }

  /**
   * @throws when the database refuses the guest — a table already full, most
   *   often. The list is left untouched then, so the screen keeps telling the
   *   truth.
   */
  async addGuest(draft: GuestDraft): Promise<Guest> {
    const guest = this.backend ? await this.backend.addGuest(draft) : this.mintLocally(draft);
    this.guestList.set([...this.guestList(), guest]);
    await this.cache();
    return guest;
  }

  /** @throws when the database refuses the change. */
  async updateGuest(id: number, draft: GuestDraft): Promise<void> {
    const stored = this.backend ? await this.backend.updateGuest(id, draft) : null;
    this.guestList.update((guests) =>
      guests.map((guest) => (guest.id === id ? (stored ?? { ...guest, ...draft }) : guest)),
    );
    await this.cache();
  }

  /** @throws when the database refuses the deletion. */
  async deleteGuest(id: number): Promise<void> {
    await this.backend?.deleteGuest(id);
    this.guestList.update((guests) => guests.filter((guest) => guest.id !== id));
    await this.cache();
  }

  /**
   * Marks attendance from the list, or from a ticket scanned at the door.
   *
   * This one writes a single column rather than the whole guest, so a device
   * recording arrivals cannot clobber an edit another one is making.
   *
   * @throws when the change could not be shared.
   */
  async setPresence(id: number, present: boolean): Promise<void> {
    const stored = this.backend ? await this.backend.setPresence(id, present) : null;
    // Without a database the hour of arrival is stamped here, so the welcome
    // screen can order a queue at the door the same way either side.
    const checkedInAt = present ? new Date().toISOString() : null;
    this.guestList.update((guests) =>
      guests.map((guest) =>
        guest.id === id ? (stored ?? { ...guest, present, checkedInAt }) : guest,
      ),
    );
    await this.cache();
  }

  /** @returns an error message, or `null` when the table was added. */
  async addTable(name: string, seatLimit = MAX_PER_TABLE): Promise<string | null> {
    const trimmed = name.trim();
    if (!trimmed) return 'Veuillez saisir un nom de table';
    // Duplicates are checked first: the seed already fills all 30 slots, so the
    // limit would otherwise mask the more useful "already exists" message.
    if (this.tableNames().includes(trimmed)) return 'Cette table existe déjà';
    if (this.tableList().length >= MAX_TABLES) return `Maximum ${MAX_TABLES} tables atteint`;

    try {
      const table = this.backend
        ? await this.backend.addTable(trimmed, seatLimit)
        : { id: nextId(this.tableList()), name: trimmed, seatLimit };
      this.tableList.set([...this.tableList(), table]);
      await this.cache();
      return null;
    } catch (error) {
      return message(error);
    }
  }

  /**
   * Removes a table nobody is seated at.
   *
   * The occupancy check is done here so the operator gets « 4 invités y sont
   * placés » instead of the foreign-key violation Postgres would raise. The
   * database still refuses the deletion if a guest slipped in meanwhile.
   *
   * @returns an error message, or `null` when the table was removed.
   */
  async deleteTable(id: number): Promise<string | null> {
    const table = this.tableList().find((candidate) => candidate.id === id);
    if (!table) return 'Table introuvable';

    const seated = this.seatsAt(table.name);
    if (seated > 0) {
      return `« ${table.name} » accueille ${seated} couvert(s) : déplacez-les d'abord`;
    }

    try {
      await this.backend?.deleteTable(id);
      this.tableList.update((tables) => tables.filter((candidate) => candidate.id !== id));
      await this.cache();
      return null;
    } catch (error) {
      return message(error);
    }
  }

  /** Identifiers are the database's job; without one, the app mints its own. */
  private mintLocally(draft: GuestDraft): Guest {
    return { ...draft, id: nextId(this.guestList()), present: false, checkedInAt: null };
  }

  /** Refreshes the offline copy and tells the other windows of this browser. */
  private async cache(): Promise<void> {
    try {
      await this.local.write(GUESTS_KEY, this.guestList());
      await this.local.write(TABLES_KEY, this.tableList());
      this.broadcast();
    } catch (error) {
      this.toast.error(`Erreur de sauvegarde locale: ${message(error)}`);
    }
  }
}

/** The 30 Bible-verse tables, for a device running without a database. */
function seedTables(): WeddingTable[] {
  return TABLE_NAMES.map((name, index) => ({
    id: index + 1,
    name,
    seatLimit: MAX_PER_TABLE,
  }));
}

function nextId(items: readonly { id: number }[]): number {
  return items.length > 0 ? Math.max(...items.map((item) => item.id)) + 1 : 1;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
