import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

const MANIFEST_URL = 'assets/img/slide/slides.json';
const FALLBACK_SLIDE = 'assets/img/slide/1.png';

/**
 * Cycles through the couple's photos on the welcome screen.
 *
 * The list comes from a build-time manifest (see
 * `scripts/generate-slides-manifest.mjs`), and the order is shuffled so a long
 * evening does not replay the same sequence.
 */
@Injectable()
export class SlideshowService {
  private readonly http = inject(HttpClient);
  private readonly slides = signal<readonly string[]>([FALLBACK_SLIDE]);
  private readonly index = signal(0);
  private timer: ReturnType<typeof setInterval> | null = null;

  readonly current = signal(FALLBACK_SLIDE);

  async start(intervalMs: number): Promise<void> {
    const slides = await this.loadManifest();
    if (slides.length > 0) {
      this.slides.set(shuffle(slides));
      this.index.set(0);
      this.current.set(this.slides()[0]);
    }
    this.stop();
    if (this.slides().length > 1) {
      this.timer = setInterval(() => this.advance(), intervalMs);
    }
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private advance(): void {
    const next = (this.index() + 1) % this.slides().length;
    this.index.set(next);
    const url = this.slides()[next];
    // Preload so the swap does not flash a blank frame on the big screen.
    const image = new Image();
    image.onload = () => this.current.set(url);
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
