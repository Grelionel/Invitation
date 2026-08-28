import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { Modal } from '../../../shared/components/modal/modal';

/**
 * Generic "are you sure?" dialog.
 *
 * Replaces the browser's `confirm()`, which cannot be styled and which some
 * kiosk browsers suppress entirely.
 */
@Component({
  selector: 'app-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Modal],
  template: `
    <app-modal
      [title]="title()"
      icon="fa-triangle-exclamation"
      iconColor="var(--error)"
      maxWidth="440px"
      (closed)="closed.emit()"
    >
      <p style="color: var(--text); line-height: 1.6; margin: 0">{{ message() }}</p>
      @if (hint(); as hint) {
        <p style="color: var(--text-light); font-size: 0.85rem; margin: 10px 0 0">
          <i class="fas fa-circle-info"></i> {{ hint }}
        </p>
      }

      <ng-container modalFooter>
        <button type="button" class="btn-cancel" (click)="closed.emit()">Annuler</button>
        <button type="button" class="btn-danger" (click)="confirmed.emit()">
          {{ confirmLabel() }}
        </button>
      </ng-container>
    </app-modal>
  `,
})
export class ConfirmDialog {
  readonly title = input('Confirmer');
  readonly message = input.required<string>();
  readonly hint = input<string | null>(null);
  readonly confirmLabel = input('Confirmer');
  readonly confirmed = output<void>();
  readonly closed = output<void>();
}
