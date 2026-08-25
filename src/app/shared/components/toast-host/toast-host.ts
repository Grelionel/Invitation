import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ToastService, type ToastType } from '../../../core/services/toast.service';

const ICONS: Record<ToastType, string> = {
  success: 'fa-check-circle',
  error: 'fa-exclamation-circle',
  info: 'fa-info-circle',
};

/** Renders the app-wide toast stack; mounted once in the shell. */
@Component({
  selector: 'app-toast-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toast-container">
      @for (toast of toasts.toasts(); track toast.id) {
        <div class="toast show" [class]="toast.type" (click)="toasts.dismiss(toast.id)">
          <div class="toast-icon"><i class="fas" [class]="icon(toast.type)"></i></div>
          <div class="toast-text">{{ toast.message }}</div>
        </div>
      }
    </div>
  `,
})
export class ToastHost {
  protected readonly toasts = inject(ToastService);

  protected icon(type: ToastType): string {
    return ICONS[type];
  }
}
