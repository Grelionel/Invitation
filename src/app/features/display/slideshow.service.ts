import { HttpClient } from '@angular/common/http';
import { Injectable, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { SlidesLibrary } from '../../core/services/slides-library.service';

const MANIFEST_URL = 'assets/img/slide/slides.json';
const FALLBACK_SLIDE = 'assets/img/slide/1.png';

/**
 * Cycles through the couple's photos on the welcome screen.
 *
 * Two sources feed it. The build-time manifest (see
 * `scripts/generate-slides-manifest.mjs`) holds the photos shipped with the
 * site; the rest come from `SlidesLibrary`, which is what the guest list adds
 * to and removes from. Either change re-enters the rotation at once, so the
 * operator can fix a photo from the first page while the screen is running.
 *
 * The order is shuffled so a long evening does not replay the same sequence.
 */
@Injectable()
export class SlideshowService {
  private readonly http = inject(HttpClient);
  private readonly library = inject(SlidesLibrary);

  private readonly slides = signal<readonly string[]>([FALLBACK_SLIDE]);
  private readonly index = signal(0);
  private shipped: readonly string[] = [];
  private started = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private intervalMs = 5000;

  readonly current = signal(FALLBACK_SLIDE);

  constructor() {
    // Reading the library before the guard keeps the effect subscribed to it,
    // so the first change after `start` is picked up.
    effect(() => {
      const added = this.library.added().map((photo) => photo.url);
      if (!this.started) return;
      this.play([...this.shipped, ...added]);
    });
  }

  async start(intervalMs: number): Promise<void> {
    this.intervalMs = intervalMs;
    const [shipped] = await Promise.all([this.loadManifest(), this.library.load()]);
    this.shipped = shipped;
    this.started = true;
    this.play([...shipped, ...this.library.added().map((photo) => photo.url)]);
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private play(slides: readonly string[]): void {
    const list = slides.length > 0 ? shuffle(slides) : [FALLBACK_SLIDE];
    this.slides.set(list);
    this.index.set(0);
    this.current.set(list[0]);
    this.stop();
    if (list.length > 1) this.timer = setInterval(() => this.advance(), this.intervalMs);
  }

  private advance(): void {
    const next = (this.index() + 1) % this.slides().length;
    this.index.set(next);
    const url = this.slides()[next];
    // Preload so the swap does not flash a blank frame on the big screen.
    const image = new Image();
    image.onload = () => this.current.set(url);
    // A photo kept in the bucket travels over the venue's network, and a
    // download that never lands used to freeze the screen on one image for the
    // rest of the evening: the swap only ever happened on `load`. Leaving the
    // current photo up and waiting for the next tick is the right failure —
    // the loop carries on, and a photo that comes back joins it again.
    image.onerror = () => undefined;
    image.src = url;
  }

  private async loadManifest(): Promise<readonly string[]> {
    try {
      return await firstValueFrom(this.http.get<string[]>(MANIFEST_URL));
    } catch (error) {
      console.warn('Slides manifest unavailable', error);
      return [];
    }
  }
}

/** Fisher-Yates, on a copy. */
function shuffle(items: readonly string[]): string[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
