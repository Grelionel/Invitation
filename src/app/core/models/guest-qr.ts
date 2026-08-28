import type { Guest } from './guest';

/** Query parameter the guest list watches for after a ticket is scanned. */
export const CHECK_IN_PARAM = 'checkin';

/**
 * What a ticket's QR code carries.
 *
 * It is a link rather than a plain label, because the code has two jobs: it is
 * printed on the invitation so a guest can read their table, and it is what the
 * host scans at the door — a phone camera opens the guest list straight on the
 * right person, and there is nothing to install.
 *
 * The name and the table travel in the address as well, so the code still says
 * something useful when it is read by an application that only shows text, and
 * so a printed ticket survives the site being taken down after the wedding.
 */
export function checkInUrl(guest: Guest, baseUrl: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set(CHECK_IN_PARAM, String(guest.id));
  url.searchParams.set('nom', guest.nom.toUpperCase());
  // A couple is invited under its family name alone, so there is no first name
  // to print — and none to encode.
  if (guest.status !== 'Couple' && guest.prenom) {
    url.searchParams.set('prenom', guest.prenom);
  }
  url.searchParams.set('table', guest.table);
  return url.toString();
}

/** File name for the downloaded code, safe on Windows as on Linux. */
export function qrFileName(guest: Guest): string {
  const parts = [guest.nom, guest.status === 'Couple' ? '' : (guest.prenom ?? '')];
  const name = parts
    .join('-')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return `invitation-${String(guest.id).padStart(2, '0')}-${name || 'invite'}.png`;
}
