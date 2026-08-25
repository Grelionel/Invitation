import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Html5Qrcode } from 'html5-qrcode';

import { ToastService } from '../../../core/services/toast.service';
import { Modal } from '../../../shared/components/modal/modal';

@Component({
  selector: 'app-scanner-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Modal],
  template: `
    <app-modal
      title="Scanner un QR Code"
      icon="fa-camera"
      iconColor="var(--success)"
      maxWidth="500px"
      (closed)="closed.emit()"
    >
      <div #reader style="width: 100%; min-height: 300px" [hidden]="detected() !== null"></div>
      @if (detected(); as text) {
        <div style="padding: 20px; text-align: center">
          <i
            class="fas fa-check-circle"
            style="font-size: 3rem; color: var(--success); margin-bottom: 10px"
          ></i>
          <p style="font-weight: 700; color: var(--text)">QR Code détecté !</p>
          <p style="color: var(--text-light); word-break: break-all">{{ text }}</p>
        </div>
      }

      <ng-container modalFooter>
        <button type="button" class="btn-cancel" (click)="closed.emit()">Fermer</button>
      </ng-container>
    </app-modal>
  `,
})
export class ScannerDialog {
  /** Emits the guest id decoded from the QR payload. */
  readonly scanned = output<number>();
  readonly closed = output<void>();

  private readonly toast = inject(ToastService);
  private readonly readerRef = viewChild.required<ElementRef<HTMLDivElement>>('reader');
  private scanner: Html5Qrcode | null = null;

  protected readonly detected = signal<string | null>(null);

  constructor() {
    afterNextRender(() => void this.start());
    inject(DestroyRef).onDestroy(() => void this.stop());
  }

  private async start(): Promise<void> {
    const element = this.readerRef().nativeElement;
    element.id ||= `qr-reader-${Date.now()}`;
    this.scanner = new Html5Qrcode(element.id);
    try {
      await this.scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1 },
        (text) => this.onDecoded(text),
        // Per-frame decode misses are the normal case, so they are ignored.
        () => undefined,
      );
    } catch (error) {
      console.error('Scanner start failed', error);
      this.toast.error("Impossible d'accéder à la caméra. Vérifiez les permissions.");
    }
  }

  private async stop(): Promise<void> {
    const scanner = this.scanner;
    this.scanner = null;
    if (!scanner?.isScanning) return;
    try {
      await scanner.stop();
      scanner.clear();
    } catch (error) {
      console.error('Scanner stop failed', error);
    }
  }

  private onDecoded(text: string): void {
    const id = extractGuestId(text);
    if (id === null) {
      this.toast.error('QR Code invalide');
      return;
    }
    this.detected.set(text);
    void this.stop();
    setTimeout(() => this.scanned.emit(id), 800);
  }
}

/** Accepts a full scan URL or any string carrying an `id=` parameter. */
function extractGuestId(text: string): number | null {
  const raw = tryUrl(text)?.searchParams.get('id') ?? /[?&]id=(\d+)/.exec(text)?.[1];
  const id = Number(raw);
  return raw && Number.isInteger(id) ? id : null;
}

function tryUrl(text: string): URL | null {
  try {
    return new URL(text);
  } catch {
    return null;
  }
}
