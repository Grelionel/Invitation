import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import type { Guest } from '../../core/models/guest';
import { LOTTERY_ELIGIBLE_LINKS } from '../../core/models/wedding.constants';
import { GuestStore } from '../../core/services/guest-store.service';
import { ToastService } from '../../core/services/toast.service';

/** Suspense countdown, in seconds, before the winner is revealed. */
const COUNTDOWN_SECONDS = 10;

@Component({
  selector: 'app-lottery-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './lottery-page.html',
  styleUrl: './lottery-page.css',
})
export class LotteryPage {
  private readonly store = inject(GuestStore);
  private readonly toast = inject(ToastService);

  protected readonly countdown = signal<number | null>(null);
  protected readonly winner = signal<Guest | null>(null);

  protected readonly progressPercent = computed(() => {
    const left = this.countdown();
    return left === null ? 0 : ((COUNTDOWN_SECONDS - left) / COUNTDOWN_SECONDS) * 100;
  });

  /**
   * Only guests who actually showed up can win, and the raffle deliberately
   * skips church contacts — this is a door prize for the wider circle.
   */
  protected readonly eligible = computed(() =>
    this.store
      .guests()
      .filter(
        (g) => g.present && g.isChristian === 'Non' && LOTTERY_ELIGIBLE_LINKS.includes(g.link),
      ),
  );

  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);
    void this.store.load();
    // Someone arriving late must be able to win.
    this.store.watch(destroyRef);
    destroyRef.onDestroy(() => this.clearTimer());
  }

  protected start(): void {
    const pool = this.eligible();
    if (pool.length === 0) {
      this.toast.error('Aucun invité présent et éligible pour le tirage !');
      return;
    }

    this.winner.set(null);
    this.countdown.set(COUNTDOWN_SECONDS);
    this.clearTimer();
    this.timer = setInterval(() => {
      const left = (this.countdown() ?? 0) - 1;
      if (left > 0) {
        this.countdown.set(left);
        return;
      }
      this.clearTimer();
      this.countdown.set(null);
      this.winner.set(pool[Math.floor(Math.random() * pool.length)]);
    }, 1000);
  }

  protected reset(): void {
    this.clearTimer();
    this.countdown.set(null);
    this.winner.set(null);
  }

  private clearTimer(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }
}
