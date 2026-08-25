import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { Guest } from '../models/guest';
import { ServerUrlService } from './server-url.service';

/** Talks to the Node companion server that shares the guest list across devices. */
@Injectable({ providedIn: 'root' })
export class GuestsApiService {
  private readonly http = inject(HttpClient);
  private readonly serverUrl = inject(ServerUrlService);

  /** Cache-busted on purpose: phones aggressively cache this endpoint. */
  fetchAll(): Promise<Guest[]> {
    const url = `${this.serverUrl.apiBase()}/guests?t=${Date.now()}`;
    return firstValueFrom(this.http.get<Guest[]>(url));
  }

  /** Rejects unless the server confirms the write, so a failed sync is never silent. */
  async replaceAll(guests: readonly Guest[]): Promise<void> {
    const url = `${this.serverUrl.apiBase()}/guests`;
    try {
      await firstValueFrom(this.http.post(url, guests));
    } catch (error) {
      throw new Error(`${describe(error)} — URL visée: ${url}`);
    }
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
