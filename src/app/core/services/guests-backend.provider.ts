import { type Provider, inject } from '@angular/core';

import { isSupabaseConfigured } from '../../../environments/environment';
import { GUESTS_BACKEND } from './guests-backend';
import { HttpGuestsBackend } from './http-guests.backend';
import { SupabaseGuestsBackend } from './supabase-guests.backend';

/**
 * Picks where the guest list lives.
 *
 * Supabase as soon as `src/environments/environment.ts` is filled in, and the
 * local Node server otherwise — which is what lets the same build run the
 * wedding offline if the venue has no usable internet.
 */
export function provideGuestsBackend(): Provider[] {
  return [
    HttpGuestsBackend,
    SupabaseGuestsBackend,
    {
      provide: GUESTS_BACKEND,
      useFactory: () =>
        isSupabaseConfigured() ? inject(SupabaseGuestsBackend) : inject(HttpGuestsBackend),
    },
  ];
}
