import { Injectable } from '@angular/core';
import type { SupabaseClient } from '@supabase/supabase-js';

import { environment } from '../../../environments/environment';
import type { Guest } from '../models/guest';
import type { GuestsBackend } from './guests-backend';
import { type GuestRow, toGuest, toRow } from './supabase-row';

const TABLE = 'guests';
/** Hardened setups expose a phone-free view instead of the table itself. */
const PUBLIC_VIEW = 'guests_public';

/**
 * Keeps the guest list in Supabase.
 *
 * Changes arrive over a realtime subscription rather than by polling, so a
 * check-in at the door reaches the hall screen as soon as Postgres commits it.
 *
 * The client library is loaded on demand: it is larger than the rest of the
 * app, and the door phone should not wait for it before the page paints.
 */
@Injectable()
export class SupabaseGuestsBackend implements GuestsBackend {
  private connection: Promise<SupabaseClient> | null = null;

  /** Set once a read proves the full table is unreadable for this visitor. */
  private usePublicView = false;

  async fetchAll(): Promise<Guest[]> {
    const rows = await this.selectRows();
    return rows.map(toGuest);
  }

  /**
   * Writes the whole list: upserts everything present, then deletes whatever
   * disappeared. Postgres does the diff, so a concurrent check-in on another
   * device survives as long as it touched a different row.
   */
  async replaceAll(guests: readonly Guest[]): Promise<void> {
    const client = await this.client();
    const rows = guests.map(toRow);

    if (rows.length > 0) {
      const { error } = await client.from(TABLE).upsert(rows, { onConflict: 'id' });
      if (error) throw described(error.message);
    }

    const keptIds = rows.map((row) => row.id);
    const query = client.from(TABLE).delete();
    const { error } = await (keptIds.length > 0
      ? query.not('id', 'in', `(${keptIds.join(',')})`)
      : query.gte('id', 0));
    if (error) throw described(error.message);
  }

  async setPresence(id: number, present: boolean): Promise<Guest> {
    const client = await this.client();
    // A single-column update, so the door phone cannot clobber an edit in
    // progress on the laptop.
    const { data, error } = await client
      .from(TABLE)
      .update({ present, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw described(error.message);

    // The hardened policies let the update through but not the read-back, so
    // look the guest up again before deciding it failed.
    if (!data) {
      const row = await this.selectRow(id);
      if (!row) throw new Error(`Invité #${id} introuvable`);
      return { ...toGuest(row), present };
    }
    return toGuest(data as GuestRow);
  }

  watch(onChange: () => void): () => void {
    let stop: (() => void) | null = null;
    let cancelled = false;

    void this.client().then((client) => {
      if (cancelled) return;
      const channel = client
        .channel('guests-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, () => onChange())
        .subscribe();
      stop = () => void client.removeChannel(channel);
    });

    // Callers may unsubscribe before the library has finished loading.
    return () => {
      cancelled = true;
      stop?.();
    };
  }

  private client(): Promise<SupabaseClient> {
    this.connection ??= import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(environment.supabaseUrl, environment.supabaseAnonKey),
    );
    return this.connection;
  }

  private async selectRows(): Promise<GuestRow[]> {
    const client = await this.client();
    const first = await client.from(this.source()).select('*').order('id');
    if (!first.error) return (first.data ?? []) as GuestRow[];

    // Retry through the phone-free view once, in case this visitor is a guest
    // rather than an operator.
    if (!this.usePublicView) {
      this.usePublicView = true;
      const retry = await client.from(PUBLIC_VIEW).select('*').order('id');
      if (!retry.error) return (retry.data ?? []) as GuestRow[];
    }
    throw described(first.error.message);
  }

  private async selectRow(id: number): Promise<GuestRow | null> {
    const client = await this.client();
    const { data } = await client.from(this.source()).select('*').eq('id', id).maybeSingle();
    return (data as GuestRow) ?? null;
  }

  private source(): string {
    return this.usePublicView ? PUBLIC_VIEW : TABLE;
  }
}

function described(message: string): Error {
  return new Error(`Supabase: ${message}`);
}
