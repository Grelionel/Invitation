import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { type Guest, type GuestDraft, displayName, statusIcon } from '../../core/models/guest';
import { MAX_PER_TABLE } from '../../core/models/wedding.constants';
import { GuestStore } from '../../core/services/guest-store.service';
import { ToastService } from '../../core/services/toast.service';
import { GuestFormDialog } from './dialogs/guest-form-dialog';
import { GuestQrDialog } from './dialogs/guest-qr-dialog';
import { GuestViewDialog } from './dialogs/guest-view-dialog';
import { ScannerDialog } from './dialogs/scanner-dialog';
import { TableFormDialog } from './dialogs/table-form-dialog';
import { ServerUrlBanner } from './server-url-banner';

const ITEMS_PER_PAGE = 10;

type OpenDialog = 'guest' | 'table' | 'view' | 'qr' | 'scanner' | null;

@Component({
  selector: 'app-guests-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    GuestFormDialog,
    GuestQrDialog,
    GuestViewDialog,
    ScannerDialog,
    TableFormDialog,
    ServerUrlBanner,
  ],
  templateUrl: './guests-page.html',
  styleUrl: './guests-page.css',
})
export class GuestsPage {
  protected readonly store = inject(GuestStore);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly maxPerTable = MAX_PER_TABLE;
  protected readonly search = signal('');
  protected readonly page = signal(1);
  protected readonly dialog = signal<OpenDialog>(null);
  /** The guest a dialog is acting on; `null` in the form dialog means "add". */
  protected readonly selected = signal<Guest | null>(null);

  protected readonly filtered = computed(() => {
    const query = this.search().toLowerCase().trim();
    const guests = this.store.sortedGuests();
    if (!query) return guests;
    return guests.filter((guest) =>
      [guest.nom, guest.prenom, guest.table, guest.status, guest.link, guest.phone]
        .filter((field): field is string => !!field)
        .some((field) => field.toLowerCase().includes(query)),
    );
  });

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filtered().length / ITEMS_PER_PAGE)),
  );

  /** Clamped so deleting the last row of a page never strands the view. */
  protected readonly currentPage = computed(() => Math.min(this.page(), this.totalPages()));

  protected readonly pageGuests = computed(() => {
    const start = (this.currentPage() - 1) * ITEMS_PER_PAGE;
    return this.filtered().slice(start, start + ITEMS_PER_PAGE);
  });

  /** Page numbers around the current one, with `null` standing in for an ellipsis. */
  protected readonly pageNumbers = computed<(number | null)[]>(() => {
    const total = this.totalPages();
    const current = this.currentPage();
    const items: (number | null)[] = [];
    for (let i = 1; i <= total; i++) {
      if (i === 1 || i === total || (i >= current - 1 && i <= current + 1)) {
        items.push(i);
      } else if (i === current - 2 || i === current + 2) {
        items.push(null);
      }
    }
    return items;
  });

  protected readonly showingInfo = computed(() => {
    const total = this.filtered().length;
    if (this.search()) return `${total} résultat(s)`;
    const start = total === 0 ? 0 : (this.currentPage() - 1) * ITEMS_PER_PAGE + 1;
    return `Affichage ${start}-${Math.min(this.currentPage() * ITEMS_PER_PAGE, total)} sur ${total}`;
  });

  protected readonly emptyStateHint = computed(() =>
    this.search()
      ? 'Aucun invité ne correspond à votre recherche.'
      : 'Commencez par ajouter un invité avec le bouton ci-dessus.',
  );

  protected readonly occupancyWarning = computed(() => {
    const over = this.store.overCapacityTables();
    if (over.length === 0) return null;
    const detail = over.map(([table, seats]) => `${table} (${seats}/${MAX_PER_TABLE})`).join(', ');
    return `Attention: ${detail} dépassent la capacité de ${MAX_PER_TABLE} places !`;
  });

  constructor() {
    void this.store.load();
    // A phone marking someone present must show up here without the operator
    // touching anything.
    this.store.watch(inject(DestroyRef));
  }

  protected name(guest: Guest): string {
    return displayName(guest);
  }

  protected icon(guest: Guest): string {
    return statusIcon(guest.status);
  }

  protected statusClass(guest: Guest): string {
    return `status-${guest.status.toLowerCase()}`;
  }

  /** `Église` → `link-eglise`: the stylesheet uses unaccented class names. */
  protected linkClass(guest: Guest): string {
    const slug = guest.link
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    return `link-${slug}`;
  }

  protected onSearch(value: string): void {
    this.search.set(value);
    this.page.set(1);
  }

  protected goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.page.set(page);
  }

  protected openAddGuest(): void {
    this.selected.set(null);
    this.dialog.set('guest');
  }

  protected open(dialog: Exclude<OpenDialog, null>, guest: Guest | null = null): void {
    this.selected.set(guest);
    this.dialog.set(dialog);
  }

  protected close(): void {
    this.dialog.set(null);
  }

  protected async saveGuest(draft: GuestDraft): Promise<void> {
    const editing = this.selected();
    this.close();
    if (editing) {
      await this.store.updateGuest(editing.id, draft);
      this.toast.success('Invité modifié avec succès');
      return;
    }
    const created = await this.store.addGuest(draft);
    this.toast.success('Invité ajouté avec succès');
    // The QR code is what the guest actually receives, so surface it right away.
    this.open('qr', created);
  }

  protected async saveTable(name: string): Promise<void> {
    const error = await this.store.addTable(name);
    if (error) {
      this.toast.error(error);
      return;
    }
    this.close();
    this.toast.success(`Table « ${name.trim()} » ajoutée`);
  }

  protected async deleteGuest(guest: Guest): Promise<void> {
    if (!confirm(`Supprimer ${displayName(guest)} ?`)) return;
    await this.store.deleteGuest(guest.id);
    this.toast.show('Invité supprimé', 'info');
  }

  protected onScanned(guestId: number): void {
    this.close();
    void this.router.navigate(['/scan'], { queryParams: { id: guestId } });
  }
}
