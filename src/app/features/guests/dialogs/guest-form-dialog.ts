import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { GuestStore } from '../../../core/services/guest-store.service';
import type { Guest, GuestDraft } from '../../../core/models/guest';
import { GUEST_LINKS, GUEST_STATUSES } from '../../../core/models/wedding.constants';
import { Modal } from '../../../shared/components/modal/modal';

@Component({
  selector: 'app-guest-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Modal, ReactiveFormsModule],
  templateUrl: './guest-form-dialog.html',
})
export class GuestFormDialog {
  /** `null` opens the dialog in "add" mode. */
  readonly guest = input<Guest | null>(null);
  readonly saved = output<GuestDraft>();
  readonly closed = output<void>();

  private readonly store = inject(GuestStore);
  private readonly fb = inject(FormBuilder);

  protected readonly statuses = GUEST_STATUSES;
  protected readonly links = GUEST_LINKS;

  protected readonly isEdit = computed(() => this.guest() !== null);

  /** Tables carry their seat count, and full ones are not selectable. */
  protected readonly tableOptions = computed(() =>
    this.store.tables().map((table) => {
      const seats = this.store.seatsAt(table.name);
      return { name: table.name, seats, limit: table.seatLimit, full: seats >= table.seatLimit };
    }),
  );

  protected readonly form = this.fb.nonNullable.group({
    status: ['', Validators.required],
    nom: ['', Validators.required],
    prenom: [''],
    table: ['', Validators.required],
    link: ['', Validators.required],
    isChristian: ['', Validators.required],
    phone: [''],
  });

  constructor() {
    effect(() => {
      const guest = this.guest();
      this.form.reset();
      if (guest) {
        this.form.setValue({
          status: guest.status,
          nom: guest.nom,
          prenom: guest.prenom ?? '',
          table: guest.table,
          link: guest.link,
          isChristian: guest.isChristian ?? '',
          phone: guest.phone ?? '',
        });
      }
    });
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.saved.emit({
      status: value.status as GuestDraft['status'],
      nom: value.nom.trim(),
      prenom: value.prenom.trim() || null,
      table: value.table,
      link: value.link as GuestDraft['link'],
      isChristian: value.isChristian as GuestDraft['isChristian'],
      phone: value.phone.trim() || null,
    });
  }
}
