import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';

import { SlidesLibrary } from '../../../core/services/slides-library.service';
import { Modal } from '../../../shared/components/modal/modal';

/**
 * The photos the welcome screen rotates through.
 *
 * Adding and removing live in one dialog, opened from the first page like every
 * other action: the operator sits at the guest list all evening, and used to
 * have to walk to the screen facing the room to change a photo.
 *
 * Deletion asks for a second click in place rather than opening a second modal
 * over the first, as the tables dialog does — no browser handles that well.
 */
@Component({
  selector: 'app-slides-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Modal],
  template: `
    <app-modal
      title="Photos du diaporama"
      icon="fa-images"
      iconColor="var(--gold)"
      maxWidth="720px"
      (closed)="closed.emit()"
    >
      <div class="form-group">
        <label class="slides-add">
          <i class="fas fa-plus"></i> Ajouter des photos
          <input type="file" accept="image/*" multiple hidden (change)="pick($event)" />
        </label>
        <p style="color: var(--text-light); font-size: 0.8rem; margin-top: 10px">
          <i class="fas fa-info-circle"></i>
          {{ library.count() }} photo(s) ajoutée(s). Elles s'affichent entre les arrivées, en
          alternance avec celles livrées avec le site.
        </p>
        <!-- Where they are kept decides who sees them, which is worth saying
             before someone adds twenty photos from the wrong device. -->
        <p style="color: var(--text-light); font-size: 0.8rem; margin-top: 4px">
          @if (library.shared) {
            <i class="fas fa-cloud" style="color: var(--gold)"></i> Partagées : visibles depuis tous
            les appareils, y compris l'écran de la salle.
          } @else {
            <i class="fas fa-laptop" style="color: var(--gold)"></i> Gardées sur cet appareil
            uniquement : ajoutez-les depuis la machine branchée au vidéoprojecteur.
          }
        </p>
      </div>

      <div class="slides-grid">
        @for (photo of library.added(); track photo.id) {
          <figure class="slides-item">
            <img [src]="photo.url" alt="Photo du diaporama" loading="lazy" />
            @if (pendingId() === photo.id) {
              <div class="slides-confirm">
                <button type="button" class="btn-cancel" (click)="pendingId.set(null)">
                  Annuler
                </button>
                <button type="button" class="btn-danger" (click)="confirmRemove(photo.id)">
                  Supprimer
                </button>
              </div>
            } @else {
              <button
                type="button"
                class="action-btn delete slides-remove"
                title="Supprimer la photo"
                aria-label="Supprimer la photo"
                (click)="pendingId.set(photo.id)"
              >
                <i class="fas fa-trash"></i>
              </button>
            }
          </figure>
        } @empty {
          <p style="color: var(--text-light)">
            Aucune photo ajoutée. Le diaporama montre celles livrées avec le site.
          </p>
        }
      </div>

      <ng-container modalFooter>
        <button type="button" class="btn-cancel" (click)="closed.emit()">Fermer</button>
        @if (library.count() > 0) {
          <button type="button" class="btn-danger" (click)="cleared.emit()">
            <i class="fas fa-trash"></i> Tout effacer
          </button>
        }
      </ng-container>
    </app-modal>
  `,
  styles: `
    .slides-add {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 20px;
      border-radius: 12px;
      background: linear-gradient(135deg, var(--accent), var(--accent-light));
      color: #fff;
      font-weight: 600;
      cursor: pointer;
    }

    .slides-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 12px;
      max-height: 340px;
      overflow-y: auto;
    }

    .slides-item {
      position: relative;
      margin: 0;
      aspect-ratio: 4 / 3;
      border: 1px solid var(--glass-border);
      border-radius: 12px;
      overflow: hidden;
      background: var(--glass);
    }

    .slides-item img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .slides-remove {
      position: absolute;
      top: 8px;
      right: 8px;
    }

    /* The confirmation covers the thumbnail: at this size there is nowhere
       beside it to put two buttons. */
    .slides-confirm {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 8px;
      background: rgba(0, 0, 0, 0.72);
    }
  `,
})
export class SlidesDialog {
  /** Photos picked from this machine; the page stores them and reports. */
  readonly added = output<readonly File[]>();
  readonly removed = output<string>();
  readonly cleared = output<void>();
  readonly closed = output<void>();

  protected readonly library = inject(SlidesLibrary);
  /** The photo whose deletion is awaiting a second click. */
  protected readonly pendingId = signal<string | null>(null);

  protected pick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    // Cleared straight away, so picking the same file twice still fires.
    input.value = '';
    if (files.length > 0) this.added.emit(files);
  }

  protected confirmRemove(id: string): void {
    this.pendingId.set(null);
    this.removed.emit(id);
  }
}
