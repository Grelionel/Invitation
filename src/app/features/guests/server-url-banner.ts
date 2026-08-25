import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { isSupabaseConfigured } from '../../../environments/environment';
import { ServerUrlService } from '../../core/services/server-url.service';
import { ToastService } from '../../core/services/toast.service';

/**
 * Floating panel for pointing the app at the laptop's LAN address.
 *
 * The address changes with every venue, so it has to be editable on the spot
 * rather than baked into a build. Hosted setups share one address already, so
 * the panel hides itself when Supabase is configured.
 */
@Component({
  selector: 'app-server-url-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  templateUrl: './server-url-banner.html',
  styleUrl: './server-url-banner.css',
})
export class ServerUrlBanner {
  private readonly serverUrl = inject(ServerUrlService);
  private readonly toast = inject(ToastService);

  protected readonly draft = signal(this.serverUrl.current());
  protected readonly dismissed = signal(isSupabaseConfigured());

  protected save(): void {
    if (!this.draft().trim()) {
      this.toast.error('Veuillez entrer une URL');
      return;
    }
    this.draft.set(this.serverUrl.set(this.draft()));
    this.toast.success('URL enregistrée avec succès !');
    this.dismissed.set(true);
  }
}
