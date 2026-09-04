/** Civil status of an invitation holder. A `Couple` occupies two seats. */
export type GuestStatus = 'Couple' | 'Monsieur' | 'Madame' | 'Mademoiselle';

/**
 * How the guest relates to the couple getting married.
 *
 * `Ami / Connaissance` is one circle rather than two: the raffle allots its
 * prizes to that circle as a whole, and nobody could tell the two apart when
 * filling the form.
 */
export type GuestLink = 'Parent' | 'Église' | 'Ami / Connaissance' | 'Collègue';

/**
 * Which side of the raffle the guest is drawn from.
 *
 * Kept apart from the link rather than folded into it (`Parent (Homme)`), so
 * the prize quotas can be expressed as a pair and the two halves stay
 * queryable on their own.
 */
export type Gender = 'Homme' | 'Femme';

export type YesNo = 'Oui' | 'Non';

export interface Guest {
  id: number;
  status: GuestStatus;
  nom: string;
  prenom: string | null;
  table: string;
  link: GuestLink;
  gender: Gender;
  isChristian: YesNo | null;
  phone: string | null;
  present: boolean;
  /**
   * When the guest was checked in, as an ISO timestamp; `null` while they are
   * still expected.
   *
   * The database has always stored the hour rather than a flag. Carrying it up
   * into the app is what lets the welcome screen order a queue at the door by
   * the moment each ticket was scanned, instead of by row order.
   */
  checkedInAt: string | null;
}

/** Everything a guest form collects — the id and the arrival are managed by the store. */
export type GuestDraft = Omit<Guest, 'id' | 'present' | 'checkedInAt'>;

const STATUS_ICONS: Record<GuestStatus, string> = {
  Couple: 'fa-heart',
  Monsieur: 'fa-male',
  Madame: 'fa-female',
  Mademoiselle: 'fa-female',
};

export function statusIcon(status: GuestStatus): string {
  return STATUS_ICONS[status] ?? 'fa-user';
}

/** A couple is shown by family name alone; everyone else gets their first name too. */
export function displayName(guest: Guest): string {
  return guest.status === 'Couple'
    ? guest.nom.toUpperCase()
    : `${guest.nom.toUpperCase()} ${guest.prenom ?? ''}`.trim();
}

/** The link as the form offers it, and as every screen shows it back. */
export function linkLabel(guest: Pick<Guest, 'link' | 'gender'>): string {
  return `${guest.link} (${guest.gender})`;
}

export function seatsFor(guest: Pick<Guest, 'status'>): number {
  return guest.status === 'Couple' ? 2 : 1;
}
