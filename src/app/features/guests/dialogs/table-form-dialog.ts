import { ChangeDetectionStrategy, Component, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { MAX_PER_TABLE, MAX_TABLES } from '../../../core/models/wedding.constants';
import { Modal } from '../../../shared/components/modal/modal';

@Component({
  selector: 'app-table-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Modal, FormsModule],
  template: `
    <app-modal
      title="Ajouter une table"
      icon="fa-chair"
      iconColor="var(--gold)"
      (closed)="closed.emit()"
    >
      <div class="form-group">
        <label class="form-label" for="tableName">Nom de la table (Passage biblique)</label>
        <input
          class="form-input"
          id="tableName"
          [(ngModel)]="name"
          (keydown.enter)="submit()"
          placeholder="Ex: Jean 3:16"
        />
        <p style="color: var(--text-light); font-size: 0.8rem; margin-top: 8px">
          <i class="fas fa-info-circle"></i> Maximum {{ maxTables }} tables au total. Une nouvelle
          table accueille {{ maxPerTable }} personnes ; ajustez sa capacité dans la base si besoin.
        </p>
      </div>

      <ng-container modalFooter>
        <button type="button" class="btn-cancel" (click)="closed.emit()">Annuler</button>
        <button type="button" class="btn-save" (click)="submit()">Ajouter</button>
      </ng-container>
    </app-modal>
  `,
})
export class TableFormDialog {
  readonly saved = output<string>();
  readonly closed = output<void>();

  protected readonly name = signal('');
  protected readonly maxTables = MAX_TABLES;
  protected readonly maxPerTable = MAX_PER_TABLE;

  protected submit(): void {
    this.saved.emit(this.name());
  }
}
