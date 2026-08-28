import type { Guest, GuestDraft, GuestLink, GuestStatus, YesNo } from '../models/guest';
import type { WeddingTable } from '../models/wedding-table';

/**
 * A guest as Postgres stores it.
 *
 * Column names differ from the app's model on purpose: Postgres folds unquoted
 * identifiers to lower case, so camelCase would have to be quoted everywhere.
 *
 * `seats` and `present` are generated columns — the database derives them from
 * `status` and `checked_in_at`, and refuses to be told otherwise. They are read
 * here and never written.
 */
export interface GuestRow {
  id: number;
  status: string;
  nom: string;
  prenom: string | null;
  wedding_table_id: number;
  link: string;
  is_christian: string | null;
  phone: string | null;
  seats: number;
  checked_in_at: string | null;
  present: boolean;
}

/** What an insert or an update may actually set. */
export interface GuestWrite {
  status: string;
  nom: string;
  prenom: string | null;
  wedding_table_id: number;
  link: string;
  is_christian: string | null;
  phone: string | null;
}

export interface WeddingTableRow {
  id: number;
  name: string;
  seat_limit: number;
}

export function toWeddingTable(row: WeddingTableRow): WeddingTable {
  return { id: row.id, name: row.name, seatLimit: row.seat_limit };
}

/**
 * Rebuilds a guest from its row.
 *
 * The table is a foreign key in the database and a name in the app, so the
 * caller passes the tables it has already loaded. An unknown id yields an empty
 * name rather than throwing: a half-drawn list beats a blank screen.
 */
export function toGuest(row: GuestRow, tablesById: ReadonlyMap<number, WeddingTable>): Guest {
  return {
    id: row.id,
    status: row.status as GuestStatus,
    nom: row.nom,
    prenom: row.prenom,
    table: tablesById.get(row.wedding_table_id)?.name ?? '',
    link: row.link as GuestLink,
    isChristian: (row.is_christian as YesNo | null) ?? null,
    phone: row.phone ?? null,
    present: row.present,
  };
}

/** @throws when the draft names a table the database does not know. */
export function toRow(
  draft: GuestDraft,
  tablesByName: ReadonlyMap<string, WeddingTable>,
): GuestWrite {
  const table = tablesByName.get(draft.table);
  if (!table) throw new Error(`Table « ${draft.table} » introuvable`);
  return {
    status: draft.status,
    nom: draft.nom,
    prenom: draft.prenom,
    wedding_table_id: table.id,
    link: draft.link,
    is_christian: draft.isChristian,
    phone: draft.phone,
  };
}

/** Presence is stored as the hour of arrival; `null` means still expected. */
export function toCheckedInAt(present: boolean): string | null {
  return present ? new Date().toISOString() : null;
}
