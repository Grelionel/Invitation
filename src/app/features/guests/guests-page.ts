import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { CHECK_IN_PARAM } from '../../core/models/guest-qr';
import {
  type Guest,
  type GuestDraft,
  displayName,
  linkLabel,
  statusIcon,
} from '../../core/models/guest';
import type { WeddingTable } from '../../core/models/wedding-table';
import { GuestStore } from '../../core/services/guest-store.service';
import { SlidesLibrary } from '../../core/services/slides-library.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmDialog } from './dialogs/confirm-dialog';
import { GuestFormDialog } from './dialogs/guest-form-dialog';
import { GuestViewDialog } from './dialogs/guest-view-dialog';
import { SlidesDialog } from './dialogs/slides-dialog';
import { TablesDialog } from './dialogs/tables-dialog';

const ITEMS_PER_PAGE = 10;

/**
 * How long a scanned ticket waits for the shared list before it is called
 * unknown.
 *
 * A phone opening the site from a QR code loads the list and the ticket at the
 * same moment, and on a weak signal the ticket wins the race. Declaring the
 * guest missing there was wrong twice over: the host reads « billet inconnu »
 * about someone standing in front of them, and the check-in they came for
 * never opens. The store re-reads every few seconds, so this leaves room for
 * more than one attempt.
 */
const UNKNOWN_TICKET_MS = 8000;

type OpenDialog = 'guest' | 'tables' | 'view' | 'confirm' | 'slides' | null;

@Component({
  selector: 'app-guests-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ConfirmDialog,
    GuestFormDialog,
    GuestViewDialog,
    SlidesDialog,
    TablesDialog,
  ],
  templateUrl: './guests-page.html',
  styleUrl: './guests-page.css',
})
export class GuestsPage {
  protected readonly store = inject(GuestStore);
  private readonly slides = inject(SlidesLibrary);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly search = signal('');
  protected readonly page = signal(1);
  protected readonly dialog = signal<OpenDialog>(null);
  /** True while the open dialog came from a ticket scanned at the door. */
  protected readonly arrival = signal(false);
  /** Id read from a scanned ticket, until the guest it names is in the list. */
  private readonly pendingTicket = signal<number | null>(null);

  /**
   * The guest a dialog is acting on, held by id rather than by value: marking
   * someone present replaces the object in the store, and the dialog left open
   * has to show the new one.
   *
   * `null` in the form dialog means "add".
   */
  private readonly selectedId = signal<number | null>(null);
  protected readonly selected = computed(
    () => this.store.guests().find((guest) => guest.id === this.selectedId()) ?? null,
  );

  protected readonly filtered = computed(() => {
    const query = this.search().toLowerCase().trim();
    const guests = this.store.sortedGuests();
    if (!query) return guests;
    return guests.filter((guest) =>
      [guest.nom, guest.prenom, guest.table, guest.status, linkLabel(guest), guest.phone]
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
    const destroyRef = inject(DestroyRef);
    this.readScannedTicket();
    void this.store.load();
    // The welcome screen usually runs in a second window; a change made here
    // has to reach it without the operator touching anything.
    this.store.watch(destroyRef);
    // The ticket is opened by whichever refresh of the list first contains the
    // guest, rather than by the one load that happened to run first.
    effect(() => this.openScannedTicket(this.store.guests()));

    // The photos are managed from here, so this page reads them too.
    void this.slides.load();

    const giveUp = setTimeout(() => this.reportUnknownTicket(), UNKNOWN_TICKET_MS);
    destroyRef.onDestroy(() => clearTimeout(giveUp));
  }

  /**
   * Takes the scanned ticket out of the address, and drops it from there.
   *
   * The QR code carries a plain link, so the phone camera does the scanning and
   * the application carries no camera code of its own. The parameter goes as
   * soon as it is read, otherwise a refresh would reopen the check-in hours
   * later.
   */
  private readScannedTicket(): void {
    const raw = this.route.snapshot.queryParamMap.get(CHECK_IN_PARAM);
    if (!raw) return;
    this.pendingTicket.set(Number(raw));
    void this.router.navigate([], { queryParams: {}, replaceUrl: true });
  }

  /** Opens the check-in as soon as the list contains the guest that was scanned. */
  private openScannedTicket(guests: readonly Guest[]): void {
    const id = this.pendingTicket();
    if (id === null) return;

    const guest = guests.find((candidate) => candidate.id === id);
    // Not an error yet: the shared list may still be on its way.
    if (!guest) return;

    this.pendingTicket.set(null);
    this.arrival.set(true);
    this.open('view', guest);
  }

  /** Says so when the ticket names nobody the list has heard of. */
  private reportUnknownTicket(): void {
    const id = this.pendingTicket();
    if (id === null) return;
    this.pendingTicket.set(null);
    this.toast.error(`Billet inconnu (invité #${id}) : la liste ne le contient pas.`);
  }

  protected name(guest: Guest): string {
    return displayName(guest);
  }

  protected icon(guest: Guest): string {
    return statusIcon(guest.status);
  }

  protected link(guest: Guest): string {
    return linkLabel(guest);
  }

  protected statusClass(guest: Guest): string {
    return `status-${guest.status.toLowerCase()}`;
  }

  /** `Ami / Connaissance` becomes `link-ami-connaissance`: class names stay ASCII. */
  protected linkClass(guest: Guest): string {
    const slug = guest.link
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
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
    this.selectedId.set(null);
    this.dialog.set('guest');
  }

  protected open(dialog: Exclude<OpenDialog, null>, guest: Guest | null = null): void {
    this.selectedId.set(guest?.id ?? null);
    this.dialog.set(dialog);
  }

  protected close(): void {
    this.dialog.set(null);
    this.arrival.set(false);
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
      const guest = await this.store.addGuest(draft);
      this.toast.success('Invité ajouté — son QR code est prêt à imprimer');
      // The code is half the point of adding a guest: it goes on their ticket.
      this.open('view', guest);
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
    this.toast.success(`Table « ${name.trim()} » ajoutée`);
  }

  protected async deleteTable(table: WeddingTable): Promise<void> {
    const error = await this.store.deleteTable(table.id);
    if (error) {
      this.toast.error(error);
      return;
    }
    this.toast.show(`Table « ${table.name} » supprimée`, 'info');
  }

  protected async addSlides(files: readonly File[]): Promise<void> {
    try {
      const added = await this.slides.add(files);
      this.toast.success(`${added} photo(s) ajoutée(s) au diaporama`);
    } catch (error) {
      this.toast.error(`Photos non ajoutées: ${reason(error)}`);
    }
  }

  protected async removeSlide(id: string): Promise<void> {
    try {
      await this.slides.remove(id);
      this.toast.show('Photo supprimée', 'info');
    } catch (error) {
      this.toast.error(`Suppression impossible: ${reason(error)}`);
    }
  }

  protected async clearSlides(): Promise<void> {
    try {
      await this.slides.clear();
      this.toast.show('Photos ajoutées effacées', 'info');
    } catch (error) {
      this.toast.error(`Effacement impossible: ${reason(error)}`);
    }
  }

  /** Attendance is recorded from the list, and from a scanned ticket. */
  protected async togglePresence(guest: Guest, present = !guest.present): Promise<void> {
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
