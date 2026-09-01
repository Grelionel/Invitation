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
import { displayName } from '../../core/models/guest';
import { TOTAL_PRIZES } from '../../core/models/wedding.constants';
import { GuestStore } from '../../core/services/guest-store.service';
import { ToastService } from '../../core/services/toast.service';
import { type CategoryState, LotteryService } from './lottery.service';

/** Suspense countdown, in seconds, before the box bursts. */
const COUNTDOWN_SECONDS = 5;
/** How long the burst runs before the winner is readable. */
const BURST_MS = 900;

/** What the screen is doing: waiting, counting down, bursting, or announcing. */
type Phase = 'idle' | 'countdown' | 'burst' | 'winner';

@Component({
  selector: 'app-lottery-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './lottery-page.html',
  styleUrl: './lottery-page.css',
})
export class LotteryPage {
  private readonly store = inject(GuestStore);
  private readonly lottery = inject(LotteryService);
  private readonly toast = inject(ToastService);

  protected readonly phase = signal<Phase>('idle');
  protected readonly countdown = signal(COUNTDOWN_SECONDS);
  protected readonly winner = signal<Guest | null>(null);
  protected readonly wonCategory = signal<CategoryState | null>(null);

  protected readonly categories = this.lottery.categories;
  protected readonly winners = this.lottery.winners;
  protected readonly prizesLeft = this.lottery.prizesLeft;
  protected readonly totalPrizes = TOTAL_PRIZES;

  protected readonly drawableLabels = computed(
    () => new Set(this.lottery.drawable().map((state) => state.label)),
  );

  protected readonly eligibleCount = computed(() =>
    this.lottery.drawable().reduce((total, state) => total + state.pool.length, 0),
  );

  protected readonly progressPercent = computed(
    () => ((COUNTDOWN_SECONDS - this.countdown()) / COUNTDOWN_SECONDS) * 100,
  );

  /** Sparks of the burst; the count is fixed, the angles are not. */
  protected readonly sparks = Array.from({ length: 18 }, (_, index) => index * 20);

  private timer: ReturnType<typeof setInterval> | null = null;
  private burstTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);
    void this.store.load();
    void this.lottery.load();
    // Someone arriving late must be able to win.
    this.store.watch(destroyRef);
    destroyRef.onDestroy(() => this.clearTimers());
  }

  protected name(guest: Guest): string {
    return displayName(guest);
  }

  /**
   * Starts a draw.
   *
   * The winner is chosen now rather than when the box bursts: the countdown is
   * theatre, and a guest walking in during those ten seconds should not change
   * a result the room is already watching.
   *
   * @param label a category to draw from, or `null` for any of them.
   */
  protected start(label: string | null = null): void {
    if (this.phase() === 'countdown' || this.phase() === 'burst') return;

    const drawn = this.lottery.pick(label);
    if (!drawn) {
      this.toast.error(
        label
          ? `Aucun invité éligible dans « ${label} » — ou plus de cadeau pour cette catégorie.`
          : 'Aucun invité présent et éligible pour le tirage !',
      );
      return;
    }

    this.winner.set(drawn.winner);
    this.wonCategory.set(drawn.state);
    this.countdown.set(COUNTDOWN_SECONDS);
    this.phase.set('countdown');
    this.clearTimers();

    this.timer = setInterval(() => {
      const left = this.countdown() - 1;
      this.countdown.set(left);
      if (left > 0) return;
      this.clearTimers();
      this.burst();
    }, 1000);
  }

  private burst(): void {
    this.phase.set('burst');
    this.burstTimer = setTimeout(() => {
      this.phase.set('winner');
      const winner = this.winner();
      const state = this.wonCategory();
      if (winner && state) void this.confirm(winner, state);
    }, BURST_MS);
  }

  private async confirm(winner: Guest, state: CategoryState): Promise<void> {
    try {
      await this.lottery.record(winner, state.category);
    } catch {
      // The board still shows the winner; only the memory of it failed.
      this.toast.error('Gagnant non enregistré : il pourrait être tiré à nouveau.');
    }
  }

  protected next(): void {
    this.clearTimers();
    this.phase.set('idle');
    this.winner.set(null);
    this.wonCategory.set(null);
  }

  protected async resetBoard(): Promise<void> {
    this.next();
    await this.lottery.reset();
    this.toast.show('Tirage remis à zéro', 'info');
  }

  private clearTimers(): void {
    if (this.timer !== null) clearInterval(this.timer);
    if (this.burstTimer !== null) clearTimeout(this.burstTimer);
    this.timer = null;
    this.burstTimer = null;
  }
}
