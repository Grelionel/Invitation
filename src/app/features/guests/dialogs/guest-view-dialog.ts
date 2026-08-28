import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { publicBaseUrl } from '../../../../environments/environment';
import { checkInUrl, qrFileName } from '../../../core/models/guest-qr';
import {
  type Guest,
  displayName,
  linkLabel,
  seatsFor,
  statusIcon,
} from '../../../core/models/guest';
import { QrCodeService, downloadDataUrl } from '../../../core/services/qr-code.service';
import { Modal } from '../../../shared/components/modal/modal';

/**
 * Everything known about one guest, and the two things done with it: the QR
 * code printed on their ticket, and their arrival.
 *
 * The same dialog serves the desk and the door. Scanning a ticket opens the
 * guest list on this dialog with `arrival` set, which is when the check-in
 * button takes the foreground — the host has one thing to do, on a phone, with
 * a queue behind them.
 */
@Component({
  selector: 'app-guest-view-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Modal],
  templateUrl: './guest-view-dialog.html',
})
export class GuestViewDialog {
  readonly guest = input.required<Guest>();
  /** Set when the dialog was opened by scanning a ticket. */
  readonly arrival = input(false);
  readonly presenceChanged = output<boolean>();
  readonly closed = output<void>();

  private readonly qrCodes = inject(QrCodeService);

  protected readonly title = computed(() =>
    this.arrival() ? 'Confirmer la présence' : "Détails de l'invité",
  );
  protected readonly name = computed(() => displayName(this.guest()));
  protected readonly icon = computed(() => statusIcon(this.guest().status));
  protected readonly seats = computed(() => seatsFor(this.guest()));
  protected readonly link = computed(() => linkLabel(this.guest()));
  protected readonly paddedId = computed(() => String(this.guest().id).padStart(2, '0'));
  /** `null` for a couple, invited under its family name alone. */
  protected readonly firstName = computed(() =>
    this.guest().status === 'Couple' ? null : (this.guest().prenom ?? '-'),
  );

  protected readonly qrDataUrl = signal<string | null>(null);
  protected readonly qrError = signal<string | null>(null);

  constructor() {
    effect(() => {
      const guest = this.guest();
      this.qrDataUrl.set(null);
      this.qrError.set(null);
      void this.drawQrCode(guest);
    });
  }

  private async drawQrCode(guest: Guest): Promise<void> {
    try {
      const url = await this.qrCodes.toDataUrl(checkInUrl(guest, publicBaseUrl()));
      // The dialog may have moved on to another guest while the encoder loaded.
      if (this.guest().id === guest.id) this.qrDataUrl.set(url);
    } catch (error) {
      if (this.guest().id === guest.id) this.qrError.set(reason(error));
    }
  }

  protected download(): void {
    const dataUrl = this.qrDataUrl();
    if (dataUrl) downloadDataUrl(dataUrl, qrFileName(this.guest()));
  }
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
