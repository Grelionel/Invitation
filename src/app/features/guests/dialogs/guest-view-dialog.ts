import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { type Guest, displayName, seatsFor, statusIcon } from '../../../core/models/guest';
import { Modal } from '../../../shared/components/modal/modal';

@Component({
  selector: 'app-guest-view-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Modal],
  templateUrl: './guest-view-dialog.html',
})
export class GuestViewDialog {
  readonly guest = input.required<Guest>();
  readonly closed = output<void>();

  protected readonly name = computed(() => displayName(this.guest()));
  protected readonly icon = computed(() => statusIcon(this.guest().status));
  protected readonly seats = computed(() => seatsFor(this.guest()));
  protected readonly paddedId = computed(() => String(this.guest().id).padStart(2, '0'));
}
