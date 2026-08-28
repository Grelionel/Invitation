import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { type Guest, type GuestDraft, displayName, statusIcon } from '../../core/models/guest';
import { GuestStore } from '../../core/services/guest-store.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmDialog } from './dialogs/confirm-dialog';
import { GuestFormDialog } from './dialogs/guest-form-dialog';
import { GuestViewDialog } from './dialogs/guest-view-dialog';
import { TableFormDialog } from './dialogs/table-form-dialog';

const ITEMS_PER_PAGE = 10;

type OpenDialog = 'guest' | 'table' | 'view' | 'confirm' | null;

@Component({
  selector: 'app-guests-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ConfirmDialog, GuestFormDialog, GuestViewDialog, TableFormDialog],
  templateUrl: './guests-page.html',
  styleUrl: './guests-page.css',
})
export class GuestsPage {
  protected readonly store = inject(GuestStore);
  private readonly toast = inject(ToastService);

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
    const detail = over
      .map(({ table, seats }) => `${table.name} (${seats}/${table.seatLimit})`)
      .join(', ');
    return `Attention: ${detail} dépassent leur capacité !`;
  });

  /** Question shown in the delete confirmation dialog. */
  protected readonly deleteMessage = computed(() => {
    const guest = this.selected();
    return guest
      ? `Voulez-vous vraiment supprimer ${displayName(guest)} de la liste des invités ?`
      : '';
  });

  constructor() {
    void this.store.load();
    // The welcome screen usually runs in a second window; a change made here
    // has to reach it without the operator touching anything.
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
    try {
      if (editing) {
        await this.store.updateGuest(editing.id, draft);
        this.toast.success('Invité modifié avec succès');
        return;
      }
      await this.store.addGuest(draft);
      this.toast.success('Invité ajouté avec succès');
    } catch (error) {
      // A full table is refused by Postgres, not by the form.
      this.toast.error(reason(error));
    }
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

  /** Attendance is recorded straight from the list now that the QR flow is gone. */
  protected async togglePresence(guest: Guest): Promise<void> {
    const present = !guest.present;
    try {
      await this.store.setPresence(guest.id, present);
      this.toast.show(
        `${displayName(guest)} marqué comme ${present ? 'Présent' : 'Attend'}`,
        present ? 'success' : 'info',
      );
    } catch (error) {
      this.toast.error(`Pointage non enregistré: ${reason(error)}`);
    }
  }

  protected async confirmDelete(): Promise<void> {
    const guest = this.selected();
    this.close();
    if (!guest) return;
    try {
      await this.store.deleteGuest(guest.id);
      this.toast.show('Invité supprimé', 'info');
    } catch (error) {
      this.toast.error(`Suppression refusée: ${reason(error)}`);
    }
  }
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
