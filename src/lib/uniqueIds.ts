/**
 * Make every row's `id` unique, keeping the first of each as it was and
 * numbering repeats ("abc", "abc#2", ...). Row ids are React keys: two rows
 * with one key make React reuse the wrong row when a list is filtered, so
 * rows that should have gone stay on screen.
 */
export function uniqueIds<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Map<string, number>();
  for (const r of rows) {
    const n = (seen.get(r.id) || 0) + 1;
    seen.set(r.id, n);
    if (n > 1) r.id = `${r.id}#${n}`;
  }
  return rows;
}
