import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { Modal } from '../modal/modal';

/**
 * Reusable confirmation dialog.
 *
 * Renders the shared `Modal` chrome with a clear question, a danger-tinted
 * confirm button and a cancel button. The host decides what `confirmLabel`
 * and `confirmIcon` best fit the action (delete, archive, etc.).
 */
@Component({
  selector: 'app-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Modal],
  template: `
    <app-modal
      [title]="title()"
      [icon]="icon()"
      [iconColor]="'var(--error)'"
      [maxWidth]="'420px'"
      (closed)="cancelled.emit()"
    >
      <div class="confirm-dialog-body">
        <i class="fas fa-exclamation-triangle confirm-dialog-warning"></i>
        <p class="confirm-dialog-message">{{ message() }}</p>
        @if (detail(); as info) {
          <p class="confirm-dialog-detail">{{ info }}</p>
        }
      </div>

      <ng-container modalFooter>
        <button type="button" class="btn-cancel" (click)="cancelled.emit()">
          {{ cancelLabel() }}
        </button>
        <button type="button" class="btn-save btn-danger" (click)="confirmed.emit()">
          <i class="fas" [class]="confirmIcon()"></i> {{ confirmLabel() }}
        </button>
      </ng-container>
    </app-modal>
  `,
  styles: [
    `
      .confirm-dialog-body {
        text-align: center;
        padding: 12px 8px 4px;
      }
      .confirm-dialog-warning {
        font-size: 3rem;
        color: var(--error);
        margin-bottom: 12px;
      }
      .confirm-dialog-message {
        font-size: 1.05rem;
        font-weight: 600;
        margin: 0 0 8px;
        color: var(--text);
      }
      .confirm-dialog-detail {
        font-size: 0.9rem;
        color: var(--text-light);
        margin: 0;
      }
      .btn-danger {
        background: var(--error);
        color: #fff;
        border-color: var(--error);
      }
      .btn-danger:hover {
        background: #c0392b;
        border-color: #c0392b;
      }
    `,
  ],
})
export class ConfirmDialog {
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly detail = input<string | null>(null);
  readonly icon = input('fa-triangle-exclamation');
  readonly confirmIcon = input('fa-trash');
  readonly confirmLabel = input('Supprimer');
  readonly cancelLabel = input('Annuler');

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();
}
