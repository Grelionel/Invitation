import { Injectable } from '@angular/core';

/** Printed on a ticket, so the code has to survive a mediocre printer. */
const SIZE_PX = 512;

/**
 * Draws the QR codes shown in the guest dialog and printed on the tickets.
 *
 * The encoder is loaded on demand: nothing needs it until a dialog opens, and
 * the hall screen never does.
 */
@Injectable({ providedIn: 'root' })
export class QrCodeService {
  private encoder: Promise<typeof import('qrcode')> | null = null;

  /** @returns a `data:image/png` URL, ready for an `<img>` or a download. */
  async toDataUrl(text: string): Promise<string> {
    const qrcode = await this.load();
    return qrcode.toDataURL(text, {
      width: SIZE_PX,
      margin: 2,
      // Level Q still reads through a fold or a coffee stain.
      errorCorrectionLevel: 'Q',
      color: { dark: '#1a1a2e', light: '#ffffff' },
    });
  }

  private load(): Promise<typeof import('qrcode')> {
    // The library is CommonJS; bundlers hand it back either as a namespace or
    // wrapped in `default`, so both shapes are accepted.
    this.encoder ??= import('qrcode').then((module) => {
      const wrapped = module as unknown as { default?: typeof import('qrcode') };
      return wrapped.default ?? module;
    });
    // A failed import must not be cached, or every later dialog inherits it.
    this.encoder.catch(() => (this.encoder = null));
    return this.encoder;
  }
}

/** Saves a data URL to the visitor's downloads folder. */
export function downloadDataUrl(dataUrl: string, fileName: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
