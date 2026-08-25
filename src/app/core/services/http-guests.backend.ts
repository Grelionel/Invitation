import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { Guest } from '../models/guest';
import type { GuestsBackend } from './guests-backend';
import { ServerUrlService } from './server-url.service';

/** How often to re-read the local server; it has no way to push changes. */
const POLL_INTERVAL_MS = 2500;

/**
 * Offline fallback: the Node server running on the laptop (`npm run serve`).
 *
 * Used whenever Supabase is not configured, which is what keeps the wedding
 * working on venue WiFi with no internet at all.
 */
@Injectable()
export class HttpGuestsBackend implements GuestsBackend {
  private readonly http = inject(HttpClient);
  private readonly serverUrl = inject(ServerUrlService);

  /** Cache-busted on purpose: phones cache this endpoint aggressively. */
  fetchAll(): Promise<Guest[]> {
    return firstValueFrom(this.http.get<Guest[]>(`${this.endpoint()}?t=${Date.now()}`));
  }

  /** Rejects unless the server confirms the write, so a failed sync is never silent. */
  async replaceAll(guests: readonly Guest[]): Promise<void> {
    try {
      await firstValueFrom(this.http.post(this.endpoint(), guests));
    } catch (error) {
      throw new Error(`${message(error)} — URL visée: ${this.endpoint()}`);
    }
  }

  /**
   * This server only understands whole-list writes, so read the current list
   * back first and change one entry in it, rather than sending a stale copy.
   */
  async setPresence(id: number, present: boolean): Promise<Guest> {
    const guests = await this.fetchAll();
    const updated = guests.map((guest) => (guest.id === id ? { ...guest, present } : guest));
    const guest = updated.find((candidate) => candidate.id === id);
    if (!guest) throw new Error(`Invité #${id} introuvable`);

    await this.replaceAll(updated);
    return guest;
  }

  watch(onChange: () => void): () => void {
    const timer = setInterval(onChange, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }

  private endpoint(): string {
    return `${this.serverUrl.apiBase()}/guests`;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
