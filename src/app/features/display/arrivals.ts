import type { Guest } from '../../core/models/guest';

/**
 * Who the welcome screen still owes an announcement to.
 *
 * Pulled out of the screen because it is the whole of the fix and none of the
 * rendering: the old code took the first unannounced guest it found and
 * dropped the rest, so two tickets scanned at the door within the same refresh
 * cost one of the two their welcome.
 *
 * `announced` is read and written by the caller — the screen has to remember
 * across refreshes, and a guest put back to waiting has to be forgotten so
 * they can be welcomed if they walk in again.
 */
export function arrivalsToAnnounce(
  guests: readonly Guest[],
  announced: Set<number>,
): readonly Guest[] {
  // A guest sent back to waiting, or deleted outright, stops counting as
  // announced. Nothing else clears this set.
  for (const id of [...announced]) {
    if (!guests.some((guest) => guest.id === id && guest.present)) announced.delete(id);
  }

  const arrivals = guests.filter((guest) => guest.present && !announced.has(guest.id));
  for (const guest of arrivals) announced.add(guest.id);

  // Oldest first, so a queue at the door is welcomed in the order it formed.
  // A guest with no recorded hour sorts first: they were marked present from
  // the list rather than scanned, and have been waiting longest either way.
  return [...arrivals].sort((a, b) => (a.checkedInAt ?? '').localeCompare(b.checkedInAt ?? ''));
}
