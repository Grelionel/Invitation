import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';

import { type Guest, displayName, seatsFor } from '../../core/models/guest';
import { GuestStore } from '../../core/services/guest-store.service';
import { ToastService } from '../../core/services/toast.service';

type ScanState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'ready'; readonly guest: Guest };

/** Delay before returning to the list, long enough to read the confirmation. */
const REDIRECT_DELAY_MS = 1200;

/**
 * Door-side check-in screen, opened by scanning a guest's printed QR code.
 *
 * The guest id arrives as the `id` query parameter, bound to an input by the
 * router.
 */
@Component({
  selector: 'app-scan-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './scan-page.html',
})
export class ScanPage {
  private readonly store = inject(GuestStore);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  /** Bound from the `?id=` query parameter by the router. */
  readonly id = input<string>();

  protected readonly state = signal<ScanState>({ kind: 'loading' });
  protected readonly saving = signal(false);

  protected readonly guest = computed(() => {
    const state = this.state();
    return state.kind === 'ready' ? state.guest : null;
  });

  constructor() {
    effect(() => void this.resolveGuest(Number(this.id())));
  }

  protected displayName = displayName;
  protected seatsFor = seatsFor;

  protected async mark(present: boolean): Promise<void> {
    const guest = this.guest();
    if (!guest || this.saving()) return;

    this.saving.set(true);
    try {
      const updated = await this.store.setPresence(guest.id, present);
      this.state.set({ kind: 'ready', guest: updated });
      this.toast.show(
        `${updated.nom} marqué comme ${present ? 'Présent' : 'Attend'}`,
        present ? 'success' : 'info',
      );
      // Only a confirmed check-in sends the operator back to the list; a
      // failure keeps them here so the scan can be retried.
      if (present) {
        setTimeout(() => void this.router.navigate(['/']), REDIRECT_DELAY_MS);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.toast.error(`Échec de la synchronisation avec le serveur (${detail}). Réessayez.`);
    } finally {
      this.saving.set(false);
    }
  }

  protected goHome(): void {
    void this.router.navigate(['/']);
  }

  private async resolveGuest(id: number): Promise<void> {
    if (!Number.isInteger(id) || id <= 0) {
      this.state.set({ kind: 'error' });
      return;
    }

    await this.store.load();
    // A phone opening this page for the first time has an empty local store,
    // so fall back to the server before giving up.
    if (this.store.guests().length === 0) {
      await this.store.syncFromServer(true);
    }

    const guest = this.store.guests().find((candidate) => candidate.id === id);
    this.state.set(guest ? { kind: 'ready', guest } : { kind: 'error' });
  }
}
