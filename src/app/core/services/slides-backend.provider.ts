import { type Provider, inject } from '@angular/core';

import { isSupabaseConfigured } from '../../../environments/environment';
import { SLIDES_BACKEND } from './slides-backend';
import { SupabaseSlidesBackend } from './supabase-slides.backend';

/**
 * Picks where the slideshow photos live.
 *
 * Supabase Storage as soon as `src/environments/environment.ts` is filled in,
 * on the same reasoning as the guest list: a photo added on a phone has to
 * reach the machine driving the projector, and a browser's own storage never
 * leaves its device.
 *
 * Left empty, the photos stay in this browser's IndexedDB — enough to run the
 * evening from one laptop, and what the application falls back to when the
 * bucket cannot be reached.
 */
export function provideSlidesBackend(): Provider[] {
  return [
    SupabaseSlidesBackend,
    {
      provide: SLIDES_BACKEND,
      useFactory: () => (isSupabaseConfigured() ? inject(SupabaseSlidesBackend) : null),
    },
  ];
}
