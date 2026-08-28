import { type Provider, inject } from '@angular/core';

import { isSupabaseConfigured } from '../../../environments/environment';
import { GUESTS_BACKEND } from './guests-backend';
import { SupabaseGuestsBackend } from './supabase-guests.backend';

/**
 * Picks where the guest list lives.
 *
 * Supabase as soon as `src/environments/environment.ts` is filled in — a
 * browser's own storage is private to its device, so a shared database is the
 * only way the laptop, the hall screen and a phone can see the same list.
 *
 * Left empty, the app still runs, but each device keeps its own list in
 * IndexedDB and nothing is shared.
 */
export function provideGuestsBackend(): Provider[] {
  return [
    SupabaseGuestsBackend,
    {
      provide: GUESTS_BACKEND,
      useFactory: () => (isSupabaseConfigured() ? inject(SupabaseGuestsBackend) : null),
    },
  ];
}
