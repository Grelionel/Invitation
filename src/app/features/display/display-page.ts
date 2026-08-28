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
import { ToastService } from '../../core/services/toast.service';
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
  private readonly toast = inject(ToastService);
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

  /** Photos picked from this machine join the rotation immediately. */
  protected async onSlidesPicked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    // Cleared straight away, so picking the same file twice still fires.
    input.value = '';
    if (files.length === 0) return;

    try {
      const added = await this.slideshow.addImages(files);
      this.toast.success(`${added} photo(s) ajoutée(s) au diaporama`);
    } catch (error) {
      this.toast.error(`Photos non ajoutées: ${reason(error)}`);
    }
  }

  protected async clearSlides(): Promise<void> {
    try {
      await this.slideshow.clearImages();
      this.toast.show('Photos ajoutées effacées', 'info');
    } catch (error) {
      this.toast.error(`Effacement impossible: ${reason(error)}`);
    }
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

    const arrival = guests.find((guest) => guest.present && !this.announced.has(guest.id));
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

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
