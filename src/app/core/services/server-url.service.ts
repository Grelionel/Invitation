import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'weddingServerUrl';
const FALLBACK_URL = 'http://localhost:3000';

/**
 * Resolves the base URL every device uses to reach the Node companion server.
 *
 * On the wedding day the app runs off a laptop on the venue's WiFi, so guests'
 * phones must hit a LAN address rather than `localhost`. The resolution order
 * is: an explicit override the operator typed in, then the origin the page was
 * served from, then localhost for the file:// case.
 */
@Injectable({ providedIn: 'root' })
export class ServerUrlService {
  private readonly url = signal(readInitialUrl());

  /** Reactive base URL — QR codes and API calls both derive from it. */
  readonly current = this.url.asReadonly();

  /** Base for API calls; the server exposes the guest list under `/api`. */
  apiBase(): string {
    return `${this.url()}/api`;
  }

  /** The URL a printed QR code should point at for a given guest. */
  scanUrlFor(guestId: number): string {
    return `${this.url()}/scan?id=${guestId}`;
  }

  /** Stores an operator-supplied address, tolerating a bare `192.168.x.y:3000`. */
  set(rawUrl: string): string {
    const url = rawUrl.trim().startsWith('http') ? rawUrl.trim() : `http://${rawUrl.trim()}`;
    localStorage.setItem(STORAGE_KEY, url);
    this.url.set(url);
    return url;
  }
}

function readInitialUrl(): string {
  const saved = localStorage.getItem(STORAGE_KEY);
  const onLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);

  // Self-healing guard: a saved "localhost" on a phone can never reach the
  // laptop, so drop it instead of staying stuck on an unreachable address.
  if (saved?.includes('localhost') && !onLocalhost) {
    localStorage.removeItem(STORAGE_KEY);
  } else if (saved) {
    return saved;
  }

  if (window.location.protocol.startsWith('http') && window.location.host) {
    return window.location.origin;
  }
  return FALLBACK_URL;
}
