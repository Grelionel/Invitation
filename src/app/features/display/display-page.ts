import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

import { type Guest, displayName, seatsFor, statusIcon } from '../../core/models/guest';
import { GuestStore } from '../../core/services/guest-store.service';
import { SlideshowService } from './slideshow.service';

/** How long a freshly arrived guest stays on screen before the photos return. */
const GUEST_VISIBLE_MS = 10_000;
const SLIDE_INTERVAL_MS = 5000;

/**
 * The big screen in the reception hall.
 *
 * It loops through the couple's photos and, whenever someone is marked present
 * in the guest list, interrupts itself to welcome that guest by name.
 */
@Component({
  selector: 'app-display-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SlideshowService],
  templateUrl: './display-page.html',
  styleUrl: './display-page.css',
})
export class DisplayPage {
  private readonly store = inject(GuestStore);
  protected readonly slideshow = inject(SlideshowService);

  protected readonly welcomed = signal<Guest | null>(null);
  protected readonly name = computed(() => {
    const guest = this.welcomed();
    return guest ? displayName(guest) : '';
  });
  protected readonly icon = computed(() => {
    const guest = this.welcomed();
    return guest ? statusIcon(guest.status) : 'fa-user';
  });
  protected readonly seats = computed(() => {
    const guest = this.welcomed();
    return guest ? seatsFor(guest) : 0;
  });

  /** Ids already welcomed, so a guest is never announced twice. */
  private announced = new Set<number>();
  private primed = false;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);
    void this.slideshow.start(SLIDE_INTERVAL_MS);

    // Announce whoever is checked in on the guest list. `effect` reacts to the
    // store, so this screen runs no timer of its own.
    void this.store.load();
    this.store.watch(destroyRef);
    effect(() => this.onGuestsChanged(this.store.guests()));

    destroyRef.onDestroy(() => {
      if (this.hideTimer !== null) clearTimeout(this.hideTimer);
      this.slideshow.stop();
    });
  }

  private onGuestsChanged(guests: readonly Guest[]): void {
    const present = guests.filter((guest) => guest.present);

    // The first read only records who was already present, otherwise opening
    // the screen mid-evening would replay every earlier arrival.
    if (!this.primed) {
      this.announced = new Set(present.map((guest) => guest.id));
      this.primed = true;
      return;
    }

    const arrival = present.find((guest) => !this.announced.has(guest.id));
    if (arrival) {
      this.announced.add(arrival.id);
      this.welcome(arrival);
    }
  }

  private welcome(guest: Guest): void {
    if (this.hideTimer !== null) clearTimeout(this.hideTimer);
    this.welcomed.set(guest);
    this.hideTimer = setTimeout(() => this.welcomed.set(null), GUEST_VISIBLE_MS);
  }
}
