/** Civil status of an invitation holder. A `Couple` occupies two seats. */
export type GuestStatus = 'Couple' | 'Monsieur' | 'Madame' | 'Mademoiselle';

/** How the guest relates to the couple getting married. */
export type GuestLink = 'Parent' | 'Ami' | 'Collègue' | 'Connaissance' | 'Église';

export type YesNo = 'Oui' | 'Non';

export interface Guest {
  id: number;
  status: GuestStatus;
  nom: string;
  prenom: string | null;
  table: string;
  link: GuestLink;
  isChristian: YesNo | null;
  phone: string | null;
  present: boolean;
}

/** Everything a guest form collects — the id and presence are managed by the store. */
export type GuestDraft = Omit<Guest, 'id' | 'present'>;

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

export function seatsFor(guest: Pick<Guest, 'status'>): number {
  return guest.status === 'Couple' ? 2 : 1;
}
