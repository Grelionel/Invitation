import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Guest } from '../../core/models/guest';
import { GuestStore } from '../../core/services/guest-store.service';
import { GuestsApiService } from '../../core/services/guests-api.service';
import { LocalStoreService } from '../../core/services/local-store.service';
import { ScanPage } from './scan-page';

const GUEST: Guest = {
  id: 1,
  status: 'Couple',
  nom: 'MUBAGHU-LUNDU',
  prenom: 'Grel',
  table: 'Genèse 2:24',
  link: 'Parent',
  isChristian: 'Non',
  phone: null,
  present: false,
};

class FakeLocalStore {
  entries = new Map<string, unknown>([['weddingGuests', [GUEST]]]);
  async read<T>(key: string, fallback: T): Promise<T> {
    return this.entries.has(key) ? (this.entries.get(key) as T) : fallback;
  }
  async write(key: string, value: unknown): Promise<void> {
    this.entries.set(key, value);
  }
}

class FakeApi {
  fetchAll = vi.fn(async () => [GUEST]);
  replaceAll = vi.fn(async () => undefined);
}

async function render(id: string | undefined) {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      GuestStore,
      { provide: LocalStoreService, useClass: FakeLocalStore },
      { provide: GuestsApiService, useClass: FakeApi },
    ],
  });

  const fixture = TestBed.createComponent(ScanPage);
  fixture.componentRef.setInput('id', id);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('ScanPage', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('renders the guest matching the id query parameter', async () => {
    const fixture = await render('1');
    const text: string = fixture.nativeElement.textContent;

    expect(text).toContain('MUBAGHU-LUNDU');
    expect(text).toContain('Genèse 2:24');
    expect(text).toContain('Attend');
  });

  it('carries the class that makes the result card visible', async () => {
    // `.scanner-result` is hidden by the stylesheet until `show` is added, so
    // rendering the guest is not enough on its own.
    const fixture = await render('1');
    const card: HTMLElement = fixture.nativeElement.querySelector('.scanner-result');

    expect(card.classList).toContain('show');
  });

  it('explains the problem when the id is missing', async () => {
    const fixture = await render(undefined);

    expect(fixture.nativeElement.textContent).toContain('Données non disponibles');
  });

  it('explains the problem when the guest is unknown', async () => {
    const fixture = await render('404');

    expect(fixture.nativeElement.textContent).toContain('Données non disponibles');
  });
});
