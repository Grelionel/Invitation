/**
 * A table in the hall, named after a Bible verse.
 *
 * It carries its own number of covers: the database owns `seat_limit`, because
 * nothing says every table in the room seats the same number of people.
 */
export interface WeddingTable {
  id: number;
  name: string;
  seatLimit: number;
}

/** Everything a table form collects — the id is minted by the database. */
export type WeddingTableDraft = Omit<WeddingTable, 'id'>;
