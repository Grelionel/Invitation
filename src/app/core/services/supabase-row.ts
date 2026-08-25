import type { Guest, GuestLink, GuestStatus, YesNo } from '../models/guest';

/**
 * A guest as Postgres stores it.
 *
 * Column names differ from the app's model on purpose: `table` is reserved in
 * SQL, and Postgres folds unquoted identifiers to lower case, so camelCase
 * would have to be quoted everywhere.
 *
 * `phone` is optional because the hardened setup serves a view without it.
 */
export interface GuestRow {
  id: number;
  status: string;
  nom: string;
  prenom: string | null;
  table_name: string;
  link: string;
  is_christian: string | null;
  phone?: string | null;
  present: boolean;
}

export function toGuest(row: GuestRow): Guest {
  return {
    id: row.id,
    status: row.status as GuestStatus,
    nom: row.nom,
    prenom: row.prenom,
    table: row.table_name,
    link: row.link as GuestLink,
    isChristian: (row.is_christian as YesNo | null) ?? null,
    phone: row.phone ?? null,
    present: row.present,
  };
}

export function toRow(guest: Guest): GuestRow {
  return {
    id: guest.id,
    status: guest.status,
    nom: guest.nom,
    prenom: guest.prenom,
    table_name: guest.table,
    link: guest.link,
    is_christian: guest.isChristian,
    phone: guest.phone,
    present: guest.present,
  };
}
