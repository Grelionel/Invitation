import { Injectable } from '@angular/core';
import type { SupabaseClient } from '@supabase/supabase-js';

import { environment, supabaseUrl } from '../../../environments/environment';
import type { SlidePhoto, SlidesBackend } from './slides-backend';

/** Bucket created by `supabase/migration-slides-storage.sql`. */
const BUCKET = 'slides';

/**
 * Supabase creates this marker inside an empty folder. It is not a photo, and
 * showing it would put a broken image on the screen facing the room.
 */
const PLACEHOLDER = '.emptyFolderPlaceholder';

/** Well past what one wedding needs; the API caps a page at 100 by default. */
const MAX_PHOTOS = 500;

/**
 * Keeps the slideshow photos in Supabase Storage.
 *
 * The point is the same as for the guest list: a browser's own storage never
 * leaves its device, so photos added on a phone during the reception could not
 * reach the machine driving the projector. A bucket can be read by all three.
 *
 * The client library is loaded on demand, as the guest backend does — the hall
 * screen should paint before it arrives.
 */
@Injectable()
export class SupabaseSlidesBackend implements SlidesBackend {
  private connection: Promise<SupabaseClient> | null = null;

  async list(): Promise<readonly SlidePhoto[]> {
    const client = await this.client();
    const { data, error } = await client.storage.from(BUCKET).list('', {
      limit: MAX_PHOTOS,
      // The name carries the upload instant, so sorting by it is chronological.
      sortBy: { column: 'name', order: 'asc' },
    });

    if (error) throw described(error.message);
    return (data ?? [])
      .filter((file) => file.name !== PLACEHOLDER)
      .map((file) => this.describe(client, file.name));
  }

  async upload(image: Blob): Promise<SlidePhoto> {
    const client = await this.client();
    const path = mintPath();
    const { error } = await client.storage.from(BUCKET).upload(path, image, {
      contentType: 'image/jpeg',
      // A minted name never collides, so an overwrite would only ever hide a
      // bug — better to hear about it.
      upsert: false,
    });

    if (error) throw described(error.message);
    return this.describe(client, path);
  }

  async remove(id: string): Promise<void> {
    const client = await this.client();
    const { error } = await client.storage.from(BUCKET).remove([id]);
    if (error) throw described(error.message);
  }

  private describe(client: SupabaseClient, path: string): SlidePhoto {
    return { id: path, url: client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
  }

  private client(): Promise<SupabaseClient> {
    this.connection ??= import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(supabaseUrl(), environment.supabaseAnonKey),
    );
    return this.connection;
  }
}

/**
 * A name that sorts chronologically and never collides.
 *
 * The timestamp comes first because `list` sorts by name, and the order photos
 * were added is the only order anyone would expect. The random tail covers two
 * devices uploading within the same millisecond.
 */
function mintPath(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${stamp}-${Math.random().toString(36).slice(2, 8)}.jpg`;
}

function described(message: string): Error {
  return new Error(`Supabase Storage: ${message}`);
}
