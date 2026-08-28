import { Injectable, computed, inject, signal } from '@angular/core';

import type { Gender, Guest, GuestLink } from '../../core/models/guest';
import { displayName } from '../../core/models/guest';
import { LOTTERY_CATEGORIES, type PrizeCategory } from '../../core/models/wedding.constants';
import { GuestStore } from '../../core/services/guest-store.service';
import { LocalStoreService } from '../../core/services/local-store.service';

const WINNERS_KEY = 'weddingLotteryWinners';

/**
 * A prize already handed out.
 *
 * The name and the table are copied rather than looked up: the board has to
 * keep reading right if the guest is edited — or deleted — after the draw.
 */
export interface LotteryWin {
  readonly guestId: number;
  readonly name: string;
  readonly status: string;
  readonly table: string;
  readonly link: GuestLink;
  readonly gender: Gender;
  readonly at: string;
}

/** A category with what is left in it, ready to be shown as a card. */
export interface CategoryState {
  readonly category: PrizeCategory;
  readonly label: string;
  readonly won: number;
  readonly left: number;
  /** Guests who could still win here — present, not Christian, not yet drawn. */
  readonly pool: readonly Guest[];
}

/**
 * The raffle: twenty gifts, six circles, and no gift given twice.
 *
 * Eligibility is deliberately narrow. A guest must be in the room (marked
 * present), must have answered « Chrétien: Non », and must belong to one of the
 * six circles the prizes are shared between — church guests appear in none of
 * them.
 *
 * Draws are remembered on the device that made them, in IndexedDB, so closing
 * the page mid-evening does not restart the raffle. They are *not* shared with
 * the other screens: the draw is run from one machine, in front of everyone.
 */
@Injectable({ providedIn: 'root' })
export class LotteryService {
  private readonly local = inject(LocalStoreService);
  private readonly store = inject(GuestStore);

  private readonly wins = signal<readonly LotteryWin[]>([]);
  private loaded: Promise<void> | null = null;

  readonly winners = this.wins.asReadonly();

  readonly categories = computed<readonly CategoryState[]>(() => {
    const taken = new Set(this.wins().map((win) => win.guestId));
    return LOTTERY_CATEGORIES.map((category) => {
      const won = this.wins().filter(
        (win) => win.link === category.link && win.gender === category.gender,
      ).length;
      return {
        category,
        label: `${category.link} (${category.gender})`,
        won,
        left: category.prizes - won,
        pool: this.store
          .guests()
          .filter(
            (guest) =>
              guest.present &&
              guest.isChristian === 'Non' &&
              guest.link === category.link &&
              guest.gender === category.gender &&
              !taken.has(guest.id),
          ),
      };
    });
  });

  /** Categories that still have a prize *and* someone in the room to win it. */
  readonly drawable = computed(() =>
    this.categories().filter((state) => state.left > 0 && state.pool.length > 0),
  );

  readonly prizesLeft = computed(() =>
    this.categories().reduce((total, state) => total + state.left, 0),
  );

  load(): Promise<void> {
    this.loaded ??= this.local
      .read<readonly LotteryWin[]>(WINNERS_KEY, [])
      .then((wins) => this.wins.set(wins))
      .catch(() => this.wins.set([]));
    return this.loaded;
  }

  /**
   * Picks a winner without recording anything.
   *
   * Drawing and recording are two steps because the countdown sits between
   * them: the name is decided when the button is pressed, and written down
   * when the box bursts.
   *
   * @param label the category to draw from, or `null` to let chance pick one.
   */
  pick(label: string | null): { winner: Guest; state: CategoryState } | null {
    const pool = label ? this.drawable().filter((state) => state.label === label) : this.drawable();
    if (pool.length === 0) return null;

    // Categories are weighted by the prizes they have left, so the four gifts
    // of a large circle are not as likely to be drawn as the three of a small
    // one only because both are one entry in a list.
    const state = weightedPick(pool);
    const winner = state.pool[Math.floor(Math.random() * state.pool.length)];
    return { winner, state };
  }

  async record(winner: Guest, category: PrizeCategory): Promise<void> {
    const win: LotteryWin = {
      guestId: winner.id,
      name: displayName(winner),
      status: winner.status,
      table: winner.table,
      link: category.link,
      gender: category.gender,
      at: new Date().toISOString(),
    };
    this.wins.set([...this.wins(), win]);
    await this.local.write(WINNERS_KEY, this.wins());
  }

  /** Wipes the board — for a rehearsal, or a draw that has to start over. */
  async reset(): Promise<void> {
    this.wins.set([]);
    await this.local.write(WINNERS_KEY, []);
  }
}

function weightedPick(states: readonly CategoryState[]): CategoryState {
  const total = states.reduce((sum, state) => sum + state.left, 0);
  let ticket = Math.random() * total;
  for (const state of states) {
    ticket -= state.left;
    if (ticket < 0) return state;
  }
  return states[states.length - 1];
}
