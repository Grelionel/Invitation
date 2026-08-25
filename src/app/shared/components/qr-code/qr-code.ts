import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  input,
  viewChild,
} from '@angular/core';
import { toCanvas } from 'qrcode';

/** Draws `value` as a QR code and can hand back a PNG for download or sharing. */
@Component({
  selector: 'app-qr-code',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<canvas #canvas></canvas>`,
  styles: `
    :host {
      display: flex;
      justify-content: center;
      margin: 15px 0;
    }
  `,
})
export class QrCode {
  readonly value = input.required<string>();
  readonly size = input(200);

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  constructor() {
    effect(() => {
      const canvas = this.canvasRef().nativeElement;
      // High correction level keeps the code readable once printed on a card.
      void toCanvas(canvas, this.value(), {
        width: this.size(),
        errorCorrectionLevel: 'H',
        color: { dark: '#1a1a2e', light: '#ffffff' },
      }).catch((error: unknown) => console.error('QR generation failed', error));
    });
  }

  toDataUrl(): string {
    return this.canvasRef().nativeElement.toDataURL('image/png');
  }
}
