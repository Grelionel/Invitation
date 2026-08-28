import { Injectable } from '@angular/core';
import type { SupabaseClient } from '@supabase/supabase-js';

import { environment } from '../../../environments/environment';
import type { Guest, GuestDraft } from '../models/guest';
import type { WeddingTable } from '../models/wedding-table';
import type { GuestsBackend, WeddingSnapshot } from './guests-backend';
import {
  type GuestRow,
  type WeddingTableRow,
  toCheckedInAt,
  toGuest,
  toRow,
  toWeddingTable,
} from './supabase-row';

const GUESTS = 'guest';
const TABLES = 'wedding_table';

/**
 * Keeps the guest list in Supabase.
 *
 * Changes arrive over a realtime subscription rather than by polling, so an
 * arrival recorded on one device reaches the hall screen as soon as Postgres
 * commits it.
 *
 * The client library is loaded on demand: it is larger than the rest of the
 * app, and the hall screen should not wait for it before the page paints.
 */
@Injectable()
export class SupabaseGuestsBackend implements GuestsBackend {
  private connection: Promise<SupabaseClient> | null = null;

  /**
   * The tables of the last read, by id and by name.
   *
   * A guest carries a table name in the app and a foreign key in the database,
   * so both directions of the translation have to be at hand. `fetchAll` is
   * what refreshes them, and every mutation goes through it first.
   */
  private byId = new Map<number, WeddingTable>();
  private byName = new Map<string, WeddingTable>();

  async fetchAll(): Promise<WeddingSnapshot> {
    const client = await this.client();

    const tableResult = await client.from(TABLES).select('*').order('id');
    if (tableResult.error) throw described(tableResult.error.message);
    const tables = ((tableResult.data ?? []) as WeddingTableRow[]).map(toWeddingTable);
    this.remember(tables);

    const guestResult = await client.from(GUESTS).select('*').order('id');
    if (guestResult.error) throw described(guestResult.error.message);
    const guests = ((guestResult.data ?? []) as GuestRow[]).map((row) => toGuest(row, this.byId));

    return { tables, guests };
  }

  async addGuest(draft: GuestDraft): Promise<Guest> {
    const client = await this.client();
    // The id is minted by Postgres, so it is absent from the insert and read
    // back from the reply.
    const { data, error } = await client
      .from(GUESTS)
      .insert(toRow(draft, await this.tables()))
      .select()
      .single();

    if (error) throw described(error.message);
    return toGuest(data as GuestRow, this.byId);
  }

  async updateGuest(id: number, draft: GuestDraft): Promise<Guest> {
    const client = await this.client();
    const { data, error } = await client
      .from(GUESTS)
      .update(toRow(draft, await this.tables()))
      .eq('id', id)
      .select()
      .single();

    if (error) throw described(error.message);
    return toGuest(data as GuestRow, this.byId);
  }

  async deleteGuest(id: number): Promise<void> {
    const client = await this.client();
    const { error } = await client.from(GUESTS).delete().eq('id', id);
    if (error) throw described(error.message);
  }

  async setPresence(id: number, present: boolean): Promise<Guest> {
    const client = await this.client();
    await this.tables(); // the reply carries a table id, which has to be named
    // A single-column update, so a device recording arrivals cannot clobber an
    // edit in progress on another one.
    const { data, error } = await client
      .from(GUESTS)
      .update({ checked_in_at: toCheckedInAt(present) })
      .eq('id', id)
      .select()
      .single();

    if (error) throw described(error.message);
    return toGuest(data as GuestRow, this.byId);
  }

  async addTable(name: string, seatLimit: number): Promise<WeddingTable> {
    const client = await this.client();
    const { data, error } = await client
      .from(TABLES)
      .insert({ name, seat_limit: seatLimit })
      .select()
      .single();

    if (error) throw described(error.message);
    const table = toWeddingTable(data as WeddingTableRow);
    this.remember([...this.byId.values(), table]);
    return table;
  }

  watch(onChange: () => void): () => void {
    let stop: (() => void) | null = null;
    let cancelled = false;

    void this.client().then((client) => {
      if (cancelled) return;
      const channel = client
        .channel('wedding-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: GUESTS }, () => onChange())
        .on('postgres_changes', { event: '*', schema: 'public', table: TABLES }, () => onChange())
        .subscribe();
      stop = () => void client.removeChannel(channel);
    });

    // Callers may unsubscribe before the library has finished loading.
    return () => {
      cancelled = true;
      stop?.();
    };
  }

  /** The tables by name, read from the database if this is the first call. */
  private async tables(): Promise<ReadonlyMap<string, WeddingTable>> {
    if (this.byName.size === 0) await this.fetchAll();
    return this.byName;
  }

  private remember(tables: readonly WeddingTable[]): void {
    this.byId = new Map(tables.map((table) => [table.id, table]));
    this.byName = new Map(tables.map((table) => [table.name, table]));
  }

  private client(): Promise<SupabaseClient> {
    this.connection ??= import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(environment.supabaseUrl, environment.supabaseAnonKey),
    );
    return this.connection;
  }
}

function described(message: string): Error {
  return new Error(`Supabase: ${message}`);
}
