import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { type Guest, displayName, fileLabel } from '../../../core/models/guest';
import { ServerUrlService } from '../../../core/services/server-url.service';
import { ToastService } from '../../../core/services/toast.service';
import { Modal } from '../../../shared/components/modal/modal';
import { QrCode } from '../../../shared/components/qr-code/qr-code';

@Component({
  selector: 'app-guest-qr-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Modal, QrCode, FormsModule],
  templateUrl: './guest-qr-dialog.html',
})
export class GuestQrDialog {
  readonly guest = input.required<Guest>();
  readonly closed = output<void>();

  private readonly serverUrl = inject(ServerUrlService);
  private readonly toast = inject(ToastService);
  private readonly qr = viewChild.required(QrCode);

  /** Editable copy of the server address, so the operator can retarget the QR. */
  protected readonly urlDraft = signal(this.serverUrl.current());
  protected readonly scanUrl = computed(() => this.serverUrl.scanUrlFor(this.guest().id));
  protected readonly name = computed(() => displayName(this.guest()));

  protected applyServerUrl(): void {
    if (!this.urlDraft().trim()) {
      this.toast.error('Veuillez entrer une URL');
      return;
    }
    this.urlDraft.set(this.serverUrl.set(this.urlDraft()));
    this.toast.success('URL mise à jour ! QR code régénéré.');
  }

  protected download(): void {
    const link = document.createElement('a');
    link.download = `QR_${fileLabel(this.guest())}.png`;
    link.href = this.qr().toDataUrl();
    link.click();
    this.toast.success('Code QR téléchargé');
  }

  /**
   * Downloads the QR image, then opens WhatsApp with a pre-written greeting —
   * the image still has to be attached by hand, which wa.me cannot automate.
   */
  protected sendWhatsApp(): void {
    const guest = this.guest();
    if (!guest.phone) {
      this.toast.error('Aucun numéro WhatsApp disponible');
      return;
    }
    this.download();

    const salutation =
      guest.status === 'Couple'
        ? `Bonjour ${guest.status} ${guest.nom}`
        : `Bonjour ${guest.status} ${guest.prenom ?? ''} ${guest.nom}`.replace(/\s+/g, ' ').trim();
    const message = encodeURIComponent(
      `${salutation},\nVoici votre QR code pour le mariage.\n\nTable : ${guest.table}`,
    );
    window.open(`https://wa.me/${guest.phone.replace(/\D/g, '')}?text=${message}`, '_blank');
    this.toast.show("QR téléchargé. WhatsApp va s'ouvrir...", 'info');
  }
}
