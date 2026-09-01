import { InjectionToken } from '@angular/core';

/**
 * A photo of the slideshow, wherever it is kept.
 *
 * `id` is what removes it — a path in Supabase Storage, or a minted string on a
 * device running without one. `url` is what an `<img>` points at: a public
 * address in the first case, a `data:` URL in the second.
 */
export interface SlidePhoto {
  readonly id: string;
  readonly url: string;
}

/**
 * Where the slideshow photos live when the devices are meant to share them.
 *
 * Storage rather than a table: a photo is a file, and Postgres is a poor place
 * to keep a megabyte of JPEG. The interface is deliberately small — the
 * slideshow needs to list, add and remove, and nothing else.
 */
export interface SlidesBackend {
  /** Every photo in the bucket, oldest first. */
  list(): Promise<readonly SlidePhoto[]>;

  /**
   * Stores one already-shrunk image.
   *
   * @throws when the bucket refuses it — missing, or its policies closed.
   */
  upload(image: Blob): Promise<SlidePhoto>;

  remove(id: string): Promise<void>;
}

/** `null` when Supabase is not configured: the photos then stay on the device. */
export const SLIDES_BACKEND = new InjectionToken<SlidesBackend | null>('SLIDES_BACKEND');
