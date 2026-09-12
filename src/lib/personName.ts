/**
 * Whether two typed names are the same person.
 *
 * Case and every space are ignored, so "Sankar Raj", "Sankarraj" and
 * "sankarraj" are one person. This mirrors person_name_key() in the database,
 * which enforces the same rule on staff_members; the two must agree or the
 * page would group people the database considers distinct.
 */
export function personNameKey(name: string | null | undefined): string {
  return (name ?? "").replace(/\s+/g, "").toLowerCase();
}
