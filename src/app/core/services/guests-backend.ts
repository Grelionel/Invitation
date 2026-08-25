import { InjectionToken } from '@angular/core';

import type { Guest } from '../models/guest';

/**
 * What the guest list needs from whatever is storing it.
 *
 * Two implementations exist: Supabase for the deployed site, and the local
 * Node server for the offline fallback at the venue. The store talks only to
 * this interface, so neither one leaks into the rest of the app.
 */
export interface GuestsBackend {
  fetchAll(): Promise<Guest[]>;

  /** Replaces the whole list. Used by the management screen only. */
  replaceAll(guests: readonly Guest[]): Promise<void>;

  /**
   * Marks one guest present or waiting.
   *
   * Separate from `replaceAll` on purpose: the door phone must not overwrite
   * an edit the laptop is making at the same moment.
   */
  setPresence(id: number, present: boolean): Promise<Guest>;

  /**
   * Calls `onChange` whenever the list changes elsewhere, and returns a
   * function that stops listening.
   */
  watch(onChange: () => void): () => void;
}

export const GUESTS_BACKEND = new InjectionToken<GuestsBackend>('GUESTS_BACKEND');
