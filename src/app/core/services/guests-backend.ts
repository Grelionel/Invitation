import { InjectionToken } from '@angular/core';

import type { Guest, GuestDraft } from '../models/guest';
import type { WeddingTable } from '../models/wedding-table';

/** One consistent read of both entities: guests are meaningless without tables. */
export interface WeddingSnapshot {
  readonly tables: readonly WeddingTable[];
  readonly guests: readonly Guest[];
}

/**
 * What the guest list needs from the database shared by every device.
 *
 * Supabase is the one implementation. The store talks only to this interface,
 * so the client library never leaks into the rest of the app.
 *
 * Every mutation touches a single row. The list is never resent wholesale:
 * identifiers are minted by Postgres, and a blanket rewrite would undo whatever
 * another device changed in the meantime.
 */
export interface GuestsBackend {
  fetchAll(): Promise<WeddingSnapshot>;

  /** @returns the stored guest, carrying the id the database minted. */
  addGuest(draft: GuestDraft): Promise<Guest>;

  updateGuest(id: number, draft: GuestDraft): Promise<Guest>;

  deleteGuest(id: number): Promise<void>;

  /**
   * Marks one guest present or waiting.
   *
   * Writes the hour of arrival rather than a flag, so the welcome screen can
   * tell a new arrival from someone who has been in the room for an hour.
   */
  setPresence(id: number, present: boolean): Promise<Guest>;

  addTable(name: string, seatLimit: number): Promise<WeddingTable>;

  /**
   * Removes an empty table.
   *
   * @throws when guests still sit there — the foreign key is `on delete
   *   restrict`, so the database is the one that says no.
   */
  deleteTable(id: number): Promise<void>;

  /**
   * Calls `onChange` whenever the data changes elsewhere, and returns a
   * function that stops listening.
   *
   * `onIssue` reports a live connection that could not be opened or was lost.
   * It exists because the failure is otherwise invisible: realtime has to be
   * published table by table, and a base where that was never done subscribes
   * without complaint and then pushes nothing at all — the phone records an
   * arrival, the hall screen sits still, and no message says why.
   */
  watch(onChange: () => void, onIssue?: (problem: string) => void): () => void;
}

/** `null` when Supabase is not configured: the app then stays device-local. */
export const GUESTS_BACKEND = new InjectionToken<GuestsBackend | null>('GUESTS_BACKEND');
