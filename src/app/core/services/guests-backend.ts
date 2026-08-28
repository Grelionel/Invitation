import { InjectionToken } from '@angular/core';

import type { Guest } from '../models/guest';

/**
 * What the guest list needs from the database shared by every device.
 *
 * Supabase is the one implementation. The store talks only to this interface,
 * so the client library never leaks into the rest of the app.
 */
export interface GuestsBackend {
  fetchAll(): Promise<Guest[]>;

  /** Replaces the whole list. Used by the management screen only. */
  replaceAll(guests: readonly Guest[]): Promise<void>;

  /**
   * Marks one guest present or waiting.
   *
   * Separate from `replaceAll` on purpose: a device pointing arrivals must not
   * overwrite an edit another one is making at the same moment.
   */
  setPresence(id: number, present: boolean): Promise<Guest>;

  /**
   * Calls `onChange` whenever the list changes elsewhere, and returns a
   * function that stops listening.
   */
  watch(onChange: () => void): () => void;
}

/** `null` when Supabase is not configured: the app then stays device-local. */
export const GUESTS_BACKEND = new InjectionToken<GuestsBackend | null>('GUESTS_BACKEND');
