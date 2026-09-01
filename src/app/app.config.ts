import { type ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { provideGuestsBackend } from './core/services/guests-backend.provider';
import { provideSlidesBackend } from './core/services/slides-backend.provider';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // Only the welcome screen calls out over HTTP, and only for its slide manifest.
    provideHttpClient(withFetch()),
    ...provideGuestsBackend(),
    ...provideSlidesBackend(),
  ],
};
