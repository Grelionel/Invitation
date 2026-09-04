import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

import { type Guest, displayName, linkLabel, seatsFor, statusIcon } from '../../core/models/guest';
import { GuestStore } from '../../core/services/guest-store.service';
import { arrivalsToAnnounce } from './arrivals';
import { SlideshowService } from './slideshow.service';

/** How long a freshly arrived guest stays on screen before the photos return. */
const GUEST_VISIBLE_MS = 5000;
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
  protected readonly link = computed(() => {
    const guest = this.welcomed();
    return guest ? linkLabel(guest) : '';
  });

  /** Ids already welcomed, so a guest is never announced twice. */
  private announced = new Set<number>();
  private primed = false;

  /**
   * Arrivals waiting their turn on the screen.
   *
   * A queue rather than a single guest: two tickets scanned at the door within
   * the same few seconds arrive in one refresh, and the screen used to keep
   * only whichever the list happened to return first. Each of them now gets
   * their own five seconds, in the order they were scanned.
   */
  private readonly queue: Guest[] = [];
  private playing = false;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);
    void this.slideshow.start(SLIDE_INTERVAL_MS);

    // Announce whoever is checked in on the guest list. `effect` reacts to the
    // store, so this screen runs no timer of its own.
    //
    // Nothing is announced before the first load has landed: the store starts
    // empty, so an effect running against that empty list would take the whole
    // room for new arrivals and welcome one of them at random.
    void this.store.load().then(() => this.prime());
    this.store.watch(destroyRef);
    effect(() => this.onGuestsChanged(this.store.guests()));

    destroyRef.onDestroy(() => {
      if (this.hideTimer !== null) clearTimeout(this.hideTimer);
      this.slideshow.stop();
    });
  }

  /**
   * Records who was already in the room, so opening the screen mid-evening
   * replays nobody.
   */
  private prime(): void {
    this.announced = new Set(
      this.store
        .guests()
        .filter((guest) => guest.present)
        .map((guest) => guest.id),
    );
    this.primed = true;
  }

  private onGuestsChanged(guests: readonly Guest[]): void {
    if (!this.primed) return;

    const arrivals = arrivalsToAnnounce(guests, this.announced);
    if (arrivals.length === 0) return;

    this.queue.push(...arrivals);
    if (!this.playing) this.playNext();
  }

  /** Shows the next arrival, or hands the screen back to the photos. */
  private playNext(): void {
    if (this.hideTimer !== null) clearTimeout(this.hideTimer);

    const next = this.queue.shift();
    if (!next) {
      this.playing = false;
      this.hideTimer = null;
      this.welcomed.set(null);
      return;
    }

    this.playing = true;
    this.welcomed.set(next);
    this.hideTimer = setTimeout(() => this.playNext(), GUEST_VISIBLE_MS);
  }
}
