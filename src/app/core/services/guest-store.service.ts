import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';

import type { Guest, GuestDraft } from '../models/guest';
import { seatsFor } from '../models/guest';
import { MAX_PER_TABLE, MAX_TABLES, TABLE_NAMES } from '../models/wedding.constants';
import { GUESTS_BACKEND } from './guests-backend';
import { LocalStoreService } from './local-store.service';
import { ToastService } from './toast.service';

const GUESTS_KEY = 'weddingGuests';
const TABLES_KEY = 'weddingTables';

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
 * are then pushed to the server, which is what lets a phone at the door and the
 * laptop in the room see the same list.
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

  /**
   * Keeps the list in step with the other devices for as long as the caller
   * lives. Supabase pushes changes; the local server is polled.
   *
   * Subscriptions are shared, so three screens on one device still cost one
   * connection.
   */
  watch(destroyRef: DestroyRef): void {
    this.watchers++;
    this.stopWatching ??= this.backend.watch(() => void this.syncFromServer(true));

    destroyRef.onDestroy(() => {
      this.watchers--;
      if (this.watchers === 0) {
        this.stopWatching?.();
        this.stopWatching = null;
      }
    });
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
  }

  /**
   * Pulls the server's list into the app.
   *
   * `silent` is used by the background poller: it stays quiet on network blips
   * and skips the update entirely when nothing changed.
   */
  async syncFromServer(silent = false): Promise<void> {
    if (!silent) this.toast.show('Synchronisation en cours...', 'info');
    try {
      const fromServer = await this.backend.fetchAll();
      const changed = JSON.stringify(fromServer) !== JSON.stringify(this.guestList());
      if (!changed) {
        if (!silent) this.toast.success('Liste déjà à jour');
        return;
      }
      this.guestList.set(fromServer);
      await this.local.write(GUESTS_KEY, fromServer);
      this.toast.show(
        silent
          ? 'Liste mise à jour (changement détecté)'
          : `${fromServer.length} invités synchronisés !`,
        silent ? 'info' : 'success',
      );
    } catch (error) {
      if (silent) return;
      this.toast.error(`Serveur inaccessible. Vérifiez l'IP et le WiFi. (${message(error)})`);
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
   * Marks attendance from the door-side scanner. Unlike the other mutations
   * this one rethrows, because the operator must know when the laptop did not
   * receive the check-in.
   */
  async setPresence(id: number, present: boolean): Promise<Guest> {
    const guest = await this.backend.setPresence(id, present);
    const updated = this.guestList().map((candidate) =>
      candidate.id === id ? { ...candidate, present } : candidate,
    );
    this.guestList.set(updated);
    await this.local.write(GUESTS_KEY, updated);
    return guest;
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

  /** Local write first, then a best-effort push so the phones see the change. */
  private async persist(): Promise<void> {
    try {
      await this.local.write(GUESTS_KEY, this.guestList());
      await this.local.write(TABLES_KEY, this.tableList());
    } catch (error) {
      this.toast.error(`Erreur de sauvegarde: ${message(error)}`);
    }

    try {
      await this.backend.replaceAll(this.guestList());
    } catch (error) {
      this.toast.error(
        `⚠️ Non envoyé au serveur (${message(error)}). Le téléphone ne verra pas ces données.`,
      );
    }
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
