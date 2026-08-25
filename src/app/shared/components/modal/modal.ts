import { ChangeDetectionStrategy, Component, HostListener, input, output } from '@angular/core';

/**
 * Overlay dialog matching the existing `.modal-overlay` design.
 *
 * Content is projected into three slots: the default slot is the body, while
 * `[modalFooter]` and `[modalActions]` fill the footer.
 */
@Component({
  selector: 'app-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './modal.html',
})
export class Modal {
  readonly title = input.required<string>();
  readonly icon = input('fa-circle-info');
  readonly iconColor = input('var(--accent)');
  /** Widens the dialog, e.g. for the camera preview. */
  readonly maxWidth = input<string | null>(null);
  readonly closed = output<void>();

  onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closed.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closed.emit();
  }
}
