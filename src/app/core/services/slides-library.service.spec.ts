import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { LocalStoreService } from './local-store.service';
import { SLIDES_BACKEND, type SlidePhoto } from './slides-backend';
import { SlidesLibrary } from './slides-library.service';

/** In-memory stand-in for IndexedDB. */
class FakeLocalStore {
  readonly entries = new Map<string, unknown>();

  async read<T>(key: string, fallback: T): Promise<T> {
    return this.entries.has(key) ? (this.entries.get(key) as T) : fallback;
  }

  async write(key: string, value: unknown): Promise<void> {
    this.entries.set(key, value);
  }
}

/** Stands in for the bucket. */
class FakeSlidesBackend {
  photos: SlidePhoto[] = [];
  private next = 1;

  readonly list = vi.fn(async (): Promise<readonly SlidePhoto[]> => this.photos);

  readonly upload = vi.fn(async (): Promise<SlidePhoto> => {
    const photo = { id: `photo-${this.next++}.jpg`, url: `https://bucket/photo-${this.next}.jpg` };
    this.photos = [...this.photos, photo];
    return photo;
  });

  readonly remove = vi.fn(async (id: string): Promise<void> => {
    this.photos = this.photos.filter((photo) => photo.id !== id);
  });
}

function setup(options: { stored?: unknown; backend?: FakeSlidesBackend | null } = {}): {
  library: SlidesLibrary;
  local: FakeLocalStore;
} {
  const local = new FakeLocalStore();
  if (options.stored !== undefined) local.entries.set('weddingSlides', options.stored);
  TestBed.configureTestingModule({
    providers: [
      SlidesLibrary,
      { provide: LocalStoreService, useValue: local },
      { provide: SLIDES_BACKEND, useValue: options.backend ?? null },
    ],
  });
  return { library: TestBed.inject(SlidesLibrary), local };
}

describe('SlidesLibrary on a device with no bucket', () => {
  it('starts empty on a device that has never added a photo', async () => {
    const { library } = setup();

    await library.load();

    expect(library.count()).toBe(0);
    expect(library.shared).toBe(false);
  });

  it('adopts the photos stored as bare data URLs by the first version', async () => {
    // A browser holding some is one where the operator already did the work of
    // picking them; losing them at an upgrade would not be forgivable.
    const { library } = setup({ stored: ['data:image/jpeg;base64,AAA'] });

    await library.load();

    expect(library.added()[0].url).toBe('data:image/jpeg;base64,AAA');
    expect(library.added()[0].id.length).toBeGreaterThan(0);
  });

  it('adopts the photos the second version stored under `dataUrl`', async () => {
    const { library } = setup({ stored: [{ id: 'a', dataUrl: 'data:image/jpeg;base64,AAA' }] });

    await library.load();

    expect(library.added()).toEqual([{ id: 'a', url: 'data:image/jpeg;base64,AAA' }]);
  });

  it('gives every adopted photo an identifier of its own', async () => {
    const { library } = setup({
      stored: ['data:image/jpeg;base64,AAA', 'data:image/jpeg;base64,BBB'],
    });

    await library.load();

    const [first, second] = library.added();
    expect(first.id).not.toBe(second.id);
  });

  it('removes one photo and leaves the others', async () => {
    const { library, local } = setup({
      stored: [
        { id: 'a', url: 'data:image/jpeg;base64,AAA' },
        { id: 'b', url: 'data:image/jpeg;base64,BBB' },
      ],
    });
    await library.load();

    await library.remove('a');

    expect(library.added().map((photo) => photo.id)).toEqual(['b']);
    expect(local.entries.get('weddingSlides')).toHaveLength(1);
  });

  it('clears every added photo', async () => {
    const { library, local } = setup({ stored: [{ id: 'a', url: 'data:image/jpeg;base64,AAA' }] });
    await library.load();

    await library.clear();

    expect(library.count()).toBe(0);
    expect(local.entries.get('weddingSlides')).toEqual([]);
  });

  it('skips the files that are not images', async () => {
    const { library } = setup();
    await library.load();

    const added = await library.add([new File(['x'], 'liste.pdf', { type: 'application/pdf' })]);

    expect(added).toBe(0);
  });

  it('falls back to no added photos when storage holds something unexpected', async () => {
    // A screen with no photos still shows the ones shipped with the site.
    const { library } = setup({ stored: { nonsense: true } });

    await library.load();

    expect(library.count()).toBe(0);
  });
});

describe('SlidesLibrary with a bucket', () => {
  it('serves what the bucket holds', async () => {
    const backend = new FakeSlidesBackend();
    backend.photos = [{ id: 'one.jpg', url: 'https://bucket/one.jpg' }];
    const { library } = setup({ backend });

    await library.load();

    expect(library.shared).toBe(true);
    expect(library.added()).toEqual(backend.photos);
  });

  it('caches the list so a reload paints before the network answers', async () => {
    const backend = new FakeSlidesBackend();
    backend.photos = [{ id: 'one.jpg', url: 'https://bucket/one.jpg' }];
    const { library, local } = setup({ backend });

    await library.load();

    expect(local.entries.get('weddingSlides')).toEqual(backend.photos);
  });

  it('keeps showing the cached photos when the bucket cannot be reached', async () => {
    const backend = new FakeSlidesBackend();
    backend.list.mockRejectedValueOnce(new Error('Failed to fetch'));
    const { library } = setup({
      backend,
      stored: [{ id: 'one.jpg', url: 'https://bucket/one.jpg' }],
    });

    await library.load();

    // The photos are the least important thing on a screen that is also
    // welcoming guests: the last known list stays up, and the next pass retries.
    expect(library.count()).toBe(1);
  });

  it('takes a photo out of the bucket, not only out of the list', async () => {
    const backend = new FakeSlidesBackend();
    backend.photos = [
      { id: 'one.jpg', url: 'https://bucket/one.jpg' },
      { id: 'two.jpg', url: 'https://bucket/two.jpg' },
    ];
    const { library } = setup({ backend });
    await library.load();

    await library.remove('one.jpg');

    expect(backend.remove).toHaveBeenCalledWith('one.jpg');
    expect(library.added().map((photo) => photo.id)).toEqual(['two.jpg']);
  });

  it('empties the bucket when everything is cleared', async () => {
    const backend = new FakeSlidesBackend();
    backend.photos = [
      { id: 'one.jpg', url: 'https://bucket/one.jpg' },
      { id: 'two.jpg', url: 'https://bucket/two.jpg' },
    ];
    const { library } = setup({ backend });
    await library.load();

    await library.clear();

    expect(backend.remove).toHaveBeenCalledTimes(2);
    expect(library.count()).toBe(0);
  });

  it('does not ask the bucket to remove an id another device already took', async () => {
    const backend = new FakeSlidesBackend();
    backend.photos = [{ id: 'one.jpg', url: 'https://bucket/one.jpg' }];
    const { library } = setup({ backend });
    await library.load();

    await library.remove('gone.jpg');

    expect(backend.remove).not.toHaveBeenCalled();
    expect(library.count()).toBe(1);
  });
});
