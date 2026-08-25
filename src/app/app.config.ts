import { type ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { provideGuestsBackend } from './core/services/guests-backend.provider';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Query parameters reach page components as signal inputs, so the scan
    // screen can read `?id=` without touching ActivatedRoute.
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withFetch()),
    ...provideGuestsBackend(),
  ],
};
