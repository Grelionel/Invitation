import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { LocalStoreService } from '../../core/services/local-store.service';

const MANIFEST_URL = 'assets/img/slide/slides.json';
const FALLBACK_SLIDE = 'assets/img/slide/1.png';
const ADDED_KEY = 'weddingSlides';

/** Longest side of a stored photo. A 4000 px original helps no projector. */
const MAX_EDGE_PX = 1920;
const JPEG_QUALITY = 0.85;

/**
 * Cycles through the couple's photos on the welcome screen.
 *
 * Two sources feed it. The build-time manifest (see
 * `scripts/generate-slides-manifest.mjs`) holds the photos shipped with the
 * site; the rest are added from the screen itself on the evening, and live in
 * this browser's IndexedDB — which is why the button sits on the welcome screen
 * rather than in the guest list: a photo added here is shown here, on the
 * machine plugged into the projector.
 *
 * The order is shuffled so a long evening does not replay the same sequence.
 */
@Injectable()
export class SlideshowService {
  private readonly http = inject(HttpClient);
  private readonly local = inject(LocalStoreService);

  private readonly slides = signal<readonly string[]>([FALLBACK_SLIDE]);
  private readonly added = signal<readonly string[]>([]);
  private readonly index = signal(0);
  private timer: ReturnType<typeof setInterval> | null = null;
  private intervalMs = 5000;

  readonly current = signal(FALLBACK_SLIDE);
  readonly addedCount = computed(() => this.added().length);

  async start(intervalMs: number): Promise<void> {
    this.intervalMs = intervalMs;
    const [shipped, added] = await Promise.all([this.loadManifest(), this.loadAdded()]);
    this.added.set(added);
    this.play([...shipped, ...added]);
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Adds photos picked from the machine showing the slideshow.
   *
   * They are shrunk before being stored: a phone photo is several megabytes,
   * IndexedDB holds them as text, and no projector shows more than 1920 px.
   *
   * @returns how many were added.
   * @throws when the browser refuses to store them — a full disk, most often.
   */
  async addImages(files: readonly File[]): Promise<number> {
    const images = files.filter((file) => file.type.startsWith('image/'));
    if (images.length === 0) return 0;

    const encoded = await Promise.all(images.map((file) => shrink(file)));
    const added = [...this.added(), ...encoded];
    await this.local.write(ADDED_KEY, added);
    this.added.set(added);

    // The new photos join the rotation straight away, and the shuffle puts them
    // where chance decides rather than at the end.
    const shipped = this.slides().filter((slide) => !slide.startsWith('data:'));
    this.play([...shipped, ...added]);
    return encoded.length;
  }

  /** Drops every photo added from this screen; the shipped ones stay. */
  async clearImages(): Promise<void> {
    await this.local.write(ADDED_KEY, []);
    this.added.set([]);
    this.play(this.slides().filter((slide) => !slide.startsWith('data:')));
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

  private async loadAdded(): Promise<readonly string[]> {
    try {
      return await this.local.read<readonly string[]>(ADDED_KEY, []);
    } catch {
      return [];
    }
  }
}

/** Re-encodes an image to at most `MAX_EDGE_PX` on its longest side. */
async function shrink(file: File): Promise<string> {
  const source = await loadImage(file);
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Redimensionnement impossible sur ce navigateur');
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Image illisible: ${file.name}`));
    };
    image.src = url;
  });
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
