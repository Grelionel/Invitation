import { Injectable, computed, inject, signal } from '@angular/core';

import { LocalStoreService } from './local-store.service';
import { SLIDES_BACKEND, type SlidePhoto } from './slides-backend';

export type { SlidePhoto } from './slides-backend';

const ADDED_KEY = 'weddingSlides';
/** Name of the channel the app's windows use to tell each other about a change. */
const CHANNEL_NAME = 'wedding-slides';

/** Longest side of a stored photo. A 4000 px original helps no projector. */
const MAX_EDGE_PX = 1920;
const JPEG_QUALITY = 0.85;

/**
 * How often the bucket is re-listed.
 *
 * Far slower than the guest list, because the two change at different rates: an
 * arrival is a few seconds of suspense, a photo added mid-evening can wait a
 * minute. It exists at all so a photo added from a phone reaches the hall
 * screen without anyone touching that machine.
 */
const REFRESH_INTERVAL_MS = 60_000;

/**
 * The photos the welcome screen rotates through, on top of those shipped with
 * the site.
 *
 * They live in Supabase Storage when it is configured, which is what lets a
 * photo added on a phone appear on the machine driving the projector. Without
 * it — or when the bucket cannot be reached — they stay in this browser's
 * IndexedDB, which is enough to run the evening from a single laptop.
 *
 * IndexedDB is also the cache in the first case: the last known list paints
 * before the network answers, so opening the screen is never a blank wait.
 *
 * Split out of `SlideshowService`, which now only rotates them, because the two
 * have different homes: the rotation belongs to the hall screen, the library is
 * edited from the guest list — the first page, where every other button is.
 */
@Injectable({ providedIn: 'root' })
export class SlidesLibrary {
  private readonly local = inject(LocalStoreService);
  private readonly backend = inject(SLIDES_BACKEND, { optional: true }) ?? null;

  private readonly photos = signal<readonly SlidePhoto[]>([]);
  private loaded: Promise<void> | null = null;
  private channel: BroadcastChannel | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  readonly added = this.photos.asReadonly();
  readonly count = computed(() => this.photos().length);
  /** True while the photos are shared with the other devices. */
  readonly shared = this.backend !== null;

  constructor() {
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = () => void this.refresh();
    }
  }

  /** Reads the photos once; concurrent callers share the same promise. */
  load(): Promise<void> {
    this.loaded ??= this.loadOnce();
    return this.loaded;
  }

  private async loadOnce(): Promise<void> {
    this.photos.set(await this.readCache());
    if (!this.backend) return;

    await this.refresh();
    // The library outlives every screen, so this interval is never cleared:
    // stopping it would mean tracking watchers for a request a minute.
    this.timer ??= setInterval(() => void this.refresh(), REFRESH_INTERVAL_MS);
  }

  /**
   * Re-lists the bucket.
   *
   * A failure is kept quiet on purpose: the cached list is still on screen, the
   * next pass will try again, and the photos are the least important thing on
   * a screen that is also welcoming guests.
   */
  private async refresh(): Promise<void> {
    if (!this.backend) {
      this.photos.set(await this.readCache());
      return;
    }
    try {
      const photos = await this.backend.list();
      if (sameList(photos, this.photos())) return;
      this.photos.set(photos);
      await this.writeCache(photos);
    } catch (error) {
      console.warn('Slides bucket unavailable', error);
    }
  }

  /**
   * Stores photos picked from a device.
   *
   * They are shrunk first: a phone photo is several megabytes, and no projector
   * shows more than 1920 px. Without a bucket they are kept as text in
   * IndexedDB, which makes the shrinking a necessity rather than a courtesy.
   *
   * @returns how many were added — files that are not images are skipped.
   * @throws when the bucket refuses them, or the browser cannot store them.
   */
  async add(files: readonly File[]): Promise<number> {
    const images = files.filter((file) => file.type.startsWith('image/'));
    if (images.length === 0) return 0;

    if (this.backend) {
      const blobs = await Promise.all(images.map((file) => shrinkToBlob(file)));
      const stored = await Promise.all(blobs.map((blob) => this.backend!.upload(blob)));
      await this.publish([...this.photos(), ...stored]);
      return stored.length;
    }

    const encoded = await Promise.all(images.map((file) => shrinkToDataUrl(file)));
    await this.publish([...this.photos(), ...encoded.map((url) => ({ id: mintId(), url }))]);
    return encoded.length;
  }

  /** Drops one photo. Unknown ids are ignored: another window may have won. */
  async remove(id: string): Promise<void> {
    if (this.backend && this.photos().some((photo) => photo.id === id)) {
      await this.backend.remove(id);
    }
    await this.publish(this.photos().filter((photo) => photo.id !== id));
  }

  /** Drops every added photo; the ones shipped with the site stay. */
  async clear(): Promise<void> {
    if (this.backend) {
      // One at a time, so a single refusal does not leave the list disagreeing
      // with the bucket about the rest.
      for (const photo of this.photos()) await this.backend.remove(photo.id);
    }
    await this.publish([]);
  }

  /** Records the new list, caches it, and tells this browser's other windows. */
  private async publish(photos: readonly SlidePhoto[]): Promise<void> {
    this.photos.set(photos);
    await this.writeCache(photos);
    this.channel?.postMessage('changed');
  }

  private async readCache(): Promise<readonly SlidePhoto[]> {
    try {
      return adopt(await this.local.read<unknown>(ADDED_KEY, []));
    } catch {
      // A screen with no photos still shows the ones shipped with the site.
      return [];
    }
  }

  private async writeCache(photos: readonly SlidePhoto[]): Promise<void> {
    try {
      await this.local.write(ADDED_KEY, photos);
    } catch (error) {
      // Only the offline copy failed; with a bucket the photos are safe, and
      // without one `add` has already reported the refusal to the operator.
      console.warn('Slides cache not written', error);
    }
  }
}

/**
 * Reads what storage holds, in any of the shapes it has had.
 *
 * Photos added by the first version are bare data URLs and the second wrote
 * `dataUrl`; a browser that has either is one where the operator already did
 * the work of picking them.
 */
function adopt(stored: unknown): readonly SlidePhoto[] {
  if (!Array.isArray(stored)) return [];
  return stored
    .map((entry): SlidePhoto | null => {
      if (typeof entry === 'string') return { id: mintId(), url: entry };
      if (!entry || typeof entry !== 'object') return null;
      const photo = entry as { id?: unknown; url?: unknown; dataUrl?: unknown };
      const url = typeof photo.url === 'string' ? photo.url : photo.dataUrl;
      if (typeof url !== 'string') return null;
      return { id: typeof photo.id === 'string' && photo.id ? photo.id : mintId(), url };
    })
    .filter((photo): photo is SlidePhoto => photo !== null);
}

function sameList(a: readonly SlidePhoto[], b: readonly SlidePhoto[]): boolean {
  return a.length === b.length && a.every((photo, index) => photo.id === b[index].id);
}

/** `randomUUID` needs a secure context, which a venue laptop may not have. */
function mintId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `slide-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

/** Re-encodes an image to at most `MAX_EDGE_PX` on its longest side. */
async function shrink(file: File): Promise<HTMLCanvasElement> {
  const source = await loadImage(file);
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Redimensionnement impossible sur ce navigateur');
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function shrinkToDataUrl(file: File): Promise<string> {
  return (await shrink(file)).toDataURL('image/jpeg', JPEG_QUALITY);
}

/** Bytes rather than text: base64 would inflate every upload by a third. */
async function shrinkToBlob(file: File): Promise<Blob> {
  const canvas = await shrink(file);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(`Image non convertie: ${file.name}`))),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
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
