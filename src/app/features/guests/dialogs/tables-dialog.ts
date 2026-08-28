import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { WeddingTable } from '../../../core/models/wedding-table';
import { MAX_TABLES } from '../../../core/models/wedding.constants';
import { GuestStore } from '../../../core/services/guest-store.service';
import { Modal } from '../../../shared/components/modal/modal';

/**
 * The room's tables: what is there, what is free, and what can go.
 *
 * Adding and removing live in one dialog because they are the same decision
 * seen from two sides — an operator renaming a passage deletes one and adds
 * the other. Deletion asks for a second click in place rather than opening a
 * second modal over the first, which no browser handles gracefully.
 */
@Component({
  selector: 'app-tables-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Modal, FormsModule],
  template: `
    <app-modal
      title="Tables"
      icon="fa-chair"
      iconColor="var(--gold)"
      maxWidth="620px"
      (closed)="closed.emit()"
    >
      <div class="form-group">
        <label class="form-label" for="tableName">Ajouter une table (passage biblique)</label>
        <div style="display: flex; gap: 10px">
          <input
            class="form-input"
            id="tableName"
            [(ngModel)]="name"
            (keydown.enter)="add()"
            placeholder="Ex: Jean 3:16"
          />
          <button type="button" class="btn-save" (click)="add()" [disabled]="full()">
            <i class="fas fa-plus"></i>
          </button>
        </div>
        <p style="color: var(--text-light); font-size: 0.8rem; margin-top: 8px">
          <i class="fas fa-info-circle"></i> {{ rows().length }} / {{ maxTables }} tables.
        </p>
      </div>

      <div class="table-list">
        @for (row of rows(); track row.table.id) {
          <div class="table-list-row">
            <div>
              <div class="table-list-name">
                <i class="fas fa-book-open"></i> {{ row.table.name }}
              </div>
              <div class="table-list-seats">
                {{ row.seats }} / {{ row.table.seatLimit }} couvert(s)
              </div>
            </div>

            @if (pendingId() === row.table.id) {
              <div class="actions-cell">
                <button type="button" class="btn-cancel" (click)="pendingId.set(null)">
                  Annuler
                </button>
                <button type="button" class="btn-danger" (click)="confirmDelete(row.table)">
                  Supprimer
                </button>
              </div>
            } @else {
              <button
                type="button"
                class="action-btn delete"
                [disabled]="row.seats > 0"
                [title]="row.seats > 0 ? 'Table occupée' : 'Supprimer la table'"
                (click)="pendingId.set(row.table.id)"
              >
                <i class="fas fa-trash"></i>
              </button>
            }
          </div>
        } @empty {
          <p style="color: var(--text-light)">Aucune table pour l'instant.</p>
        }
      </div>

      <ng-container modalFooter>
        <button type="button" class="btn-cancel" (click)="closed.emit()">Fermer</button>
      </ng-container>
    </app-modal>
  `,
  styles: `
    .table-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 320px;
      overflow-y: auto;
    }

    .table-list-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 15px;
      background: var(--glass);
      border: 1px solid var(--glass-border);
      border-radius: 12px;
    }

    .table-list-name {
      font-weight: 600;
    }

    .table-list-seats {
      color: var(--text-light);
      font-size: 0.8rem;
      margin-top: 2px;
    }

    .action-btn:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }
  `,
})
export class TablesDialog {
  readonly saved = output<string>();
  readonly deleted = output<WeddingTable>();
  readonly closed = output<void>();

  private readonly store = inject(GuestStore);

  protected readonly name = signal('');
  protected readonly maxTables = MAX_TABLES;
  /** The table whose deletion is awaiting a second click. */
  protected readonly pendingId = signal<number | null>(null);

  protected readonly rows = computed(() =>
    this.store.tables().map((table) => ({ table, seats: this.store.seatsAt(table.name) })),
  );

  protected readonly full = computed(() => this.rows().length >= MAX_TABLES);

  protected add(): void {
    this.saved.emit(this.name());
    this.name.set('');
  }

  protected confirmDelete(table: WeddingTable): void {
    this.pendingId.set(null);
    this.deleted.emit(table);
  }
}
