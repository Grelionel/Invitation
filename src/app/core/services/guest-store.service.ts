import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';

import type { Guest, GuestDraft } from '../models/guest';
import { seatsFor } from '../models/guest';
import { MAX_PER_TABLE, MAX_TABLES, TABLE_NAMES } from '../models/wedding.constants';
import { GUESTS_BACKEND } from './guests-backend';
import { LocalStoreService } from './local-store.service';
import { ToastService } from './toast.service';

const GUESTS_KEY = 'weddingGuests';
const TABLES_KEY = 'weddingTables';
/** Name of the channel the app's windows use to tell each other about a write. */
const CHANNEL_NAME = 'wedding-store';

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
 * Writes go to IndexedDB first (so nothing is lost if the network is down) and
 * are then pushed to Supabase, which is what lets the laptop, the hall screen
 * and a phone see the same list — a browser's own storage never leaves its
 * device.
 */
@Injectable({ providedIn: 'root' })
export class GuestStore {
  private readonly local = inject(LocalStoreService);
  private readonly backend = inject(GUESTS_BACKEND);
  private readonly toast = inject(ToastService);

  private readonly guestList = signal<readonly Guest[]>([]);
  private readonly tableList = signal<readonly string[]>([]);
  private initialized: Promise<void> | null = null;

  readonly guests = this.guestList.asReadonly();
  readonly tables = this.tableList.asReadonly();

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
    const capacity = tables.length * MAX_PER_TABLE;
    return {
      guests: guests.length,
      tables: tables.length,
      seats,
      couples: guests.filter((g) => g.status === 'Couple').length,
      present: guests.filter((g) => g.present).length,
      capacityPercent: capacity > 0 ? Math.min(Math.round((seats / capacity) * 100), 100) : 0,
    };
  });

  /** Seats booked per table, used both for warnings and for the table picker. */
  readonly occupancy = computed<ReadonlyMap<string, number>>(() => {
    const counts = new Map<string, number>();
    for (const guest of this.guestList()) {
      counts.set(guest.table, (counts.get(guest.table) ?? 0) + seatsFor(guest));
    }
    return counts;
  });

  readonly overCapacityTables = computed(() =>
    [...this.occupancy().entries()].filter(([, seats]) => seats > MAX_PER_TABLE),
  );

  seatsAt(table: string): number {
    return this.occupancy().get(table) ?? 0;
  }

  private watchers = 0;
  private stopWatching: (() => void) | null = null;
  private channel: BroadcastChannel | null = null;

  /**
   * Keeps the list in step with the other screens for as long as the caller
   * lives. Supabase pushes changes made on any device; the broadcast channel
   * covers the windows of this browser, which is all there is when Supabase
   * has not been configured.
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
    const stopBackend = this.backend?.watch(() => void this.pull(true)) ?? null;

    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = () => void this.reloadLocal();
    }

    return () => {
      stopBackend?.();
      this.channel?.close();
      this.channel = null;
    };
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
        this.local.read<readonly string[] | null>(TABLES_KEY, null),
        this.local.read<readonly Guest[] | null>(GUESTS_KEY, null),
      ]);
      this.tableList.set(tables ?? [...TABLE_NAMES]);
      this.guestList.set(guests ?? []);
      if (!tables) await this.local.write(TABLES_KEY, this.tableList());
    } catch (error) {
      this.tableList.set([...TABLE_NAMES]);
      this.guestList.set([]);
      this.toast.error(`Erreur de chargement: ${message(error)}`);
    }

    // The cached copy paints immediately; the shared list is what counts.
    await this.pull(false);
  }

  /**
   * Pulls the shared list into the app, and does nothing when it already
   * matches.
   *
   * `background` marks the calls driven by the realtime subscription: a change
   * arriving mid-evening is worth announcing, while a network blip is not —
   * the next change will retry. The initial load is the mirror image: there is
   * no change to announce, but the operator must know when the shared list
   * could not be reached.
   */
  private async pull(background: boolean): Promise<void> {
    if (!this.backend) return;
    try {
      const shared = await this.backend.fetchAll();
      if (JSON.stringify(shared) === JSON.stringify(this.guestList())) return;
      this.guestList.set(shared);
      await this.local.write(GUESTS_KEY, shared);
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
        this.local.read<readonly string[] | null>(TABLES_KEY, null),
        this.local.read<readonly Guest[] | null>(GUESTS_KEY, null),
      ]);
      if (tables) this.tableList.set(tables);
      if (guests) this.guestList.set(guests);
    } catch {
      // Ignored on purpose — the next broadcast will try again.
    }
  }

  async addGuest(draft: GuestDraft): Promise<Guest> {
    const guests = this.guestList();
    const id = guests.length > 0 ? Math.max(...guests.map((g) => g.id)) + 1 : 1;
    const guest: Guest = { ...draft, id, present: false };
    this.guestList.set([...guests, guest]);
    await this.persist();
    return guest;
  }

  async updateGuest(id: number, draft: GuestDraft): Promise<void> {
    this.guestList.update((guests) =>
      guests.map((guest) => (guest.id === id ? { ...guest, ...draft } : guest)),
    );
    await this.persist();
  }

  async deleteGuest(id: number): Promise<void> {
    this.guestList.update((guests) => guests.filter((guest) => guest.id !== id));
    await this.persist();
  }

  /**
   * Marks attendance from the list.
   *
   * This one updates a single row rather than resending everything, so a
   * device pointing arrivals cannot clobber an edit another one is making.
   */
  async setPresence(id: number, present: boolean): Promise<void> {
    const updated = this.guestList().map((guest) =>
      guest.id === id ? { ...guest, present } : guest,
    );
    this.guestList.set(updated);

    try {
      await this.local.write(GUESTS_KEY, updated);
      this.broadcast();
    } catch (error) {
      this.toast.error(`Erreur de sauvegarde: ${message(error)}`);
    }

    if (!this.backend) return;
    try {
      await this.backend.setPresence(id, present);
    } catch (error) {
      this.toast.error(
        `⚠️ Pointage non partagé (${message(error)}). Les autres écrans l'ignorent.`,
      );
    }
  }

  /** @returns an error message, or `null` when the table was added. */
  async addTable(name: string): Promise<string | null> {
    const trimmed = name.trim();
    if (!trimmed) return 'Veuillez saisir un nom de table';
    // Duplicates are checked first: the seed already fills all 30 slots, so the
    // limit would otherwise mask the more useful "already exists" message.
    if (this.tableList().includes(trimmed)) return 'Cette table existe déjà';
    if (this.tableList().length >= MAX_TABLES) return `Maximum ${MAX_TABLES} tables atteint`;

    this.tableList.update((tables) => [...tables, trimmed]);
    await this.persist();
    return null;
  }

  /** Local write first, then a best-effort push so the other screens see it. */
  private async persist(): Promise<void> {
    try {
      await this.local.write(GUESTS_KEY, this.guestList());
      await this.local.write(TABLES_KEY, this.tableList());
      this.broadcast();
    } catch (error) {
      this.toast.error(`Erreur de sauvegarde: ${message(error)}`);
    }

    if (!this.backend) return;
    try {
      await this.backend.replaceAll(this.guestList());
    } catch (error) {
      this.toast.error(
        `⚠️ Non envoyé à la base (${message(error)}). Les autres appareils ne verront pas ces données.`,
      );
    }
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
