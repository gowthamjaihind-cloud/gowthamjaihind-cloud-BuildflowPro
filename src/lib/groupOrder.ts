// Ordering phases and locations the way the job runs.
//
// Phases and locations used to be listed A to Z ("First floor", "Ground floor",
// "Handover", "Substructure"...), so the plan read in a different order from
// the work on site. Every place that groups tasks by phase or location now
// lists the groups by when their work is scheduled to start: the group whose
// earliest task starts first comes first. Groups with no dates go after the
// dated ones, the catch-all "Unassigned ..." groups go last, and a tie (same
// start date) falls back to the name so the order never jumps about.

/** Names that collect tasks with no phase or location: always listed last. */
export const UNASSIGNED_GROUPS = [
  "Unassigned Phase",
  "Unassigned Location",
  "Unknown Phase",
  "No Location",
];

type DateLike = string | Date | null | undefined;

/** Epoch ms for a start date, or null when there is none or it does not parse. */
function startMs(d: DateLike): number | null {
  if (!d) return null;
  const ms = d instanceof Date ? d.getTime() : new Date(d).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Earliest start among the items, or null when none of them has a date. */
export function earliestStart<T>(items: T[], startOf: (t: T) => DateLike): number | null {
  let min: number | null = null;
  for (const t of items) {
    const ms = startMs(startOf(t));
    if (ms !== null && (min === null || ms < min)) min = ms;
  }
  return min;
}

/**
 * Compare two groups for schedule order. `a`/`b` are the group names and
 * `aStart`/`bStart` the earliest start in each (null = no dates).
 */
export function compareGroups(a: string, aStart: number | null, b: string, bStart: number | null): number {
  const aLast = UNASSIGNED_GROUPS.includes(a) ? 1 : 0;
  const bLast = UNASSIGNED_GROUPS.includes(b) ? 1 : 0;
  if (aLast !== bLast) return aLast - bLast;
  if (aStart !== bStart) {
    if (aStart === null) return 1;
    if (bStart === null) return -1;
    return aStart - bStart;
  }
  return a.localeCompare(b);
}

/** The group names in schedule order. */
export function orderGroupKeys<T>(groups: Map<string, T[]> | Record<string, T[]>, startOf: (t: T) => DateLike): string[] {
  const entries: [string, T[]][] = groups instanceof Map ? Array.from(groups.entries()) : Object.entries(groups);
  const start = new Map(entries.map(([k, items]) => [k, earliestStart(items, startOf)]));
  return entries
    .map(([k]) => k)
    .sort((a, b) => compareGroups(a, start.get(a) ?? null, b, start.get(b) ?? null));
}

/**
 * Phase -> location -> tasks, rebuilt with phases and locations in schedule
 * order (a phase starts when its earliest task does, across all its
 * locations). Object key order is insertion order, so rendering with
 * Object.entries keeps it.
 */
export function orderPhaseLocationGroups<T>(
  phases: Record<string, Record<string, T[]>>,
  startOf: (t: T) => DateLike,
): Record<string, Record<string, T[]>> {
  const byPhase: Record<string, T[]> = {};
  for (const [p, locs] of Object.entries(phases)) byPhase[p] = Object.values(locs).flat();
  const out: Record<string, Record<string, T[]>> = {};
  for (const p of orderGroupKeys(byPhase, startOf)) {
    out[p] = {};
    for (const l of orderGroupKeys(phases[p], startOf)) out[p][l] = phases[p][l];
  }
  return out;
}

/**
 * A pick list of names (phases or locations): the ones the project uses, in
 * schedule order, then the remaining suggestions in their own order.
 */
export function orderNameList<T>(
  tasks: T[],
  nameOf: (t: T) => string | undefined,
  startOf: (t: T) => DateLike,
  suggestions: string[],
): string[] {
  const used = new Map<string, T[]>();
  for (const t of tasks) {
    const n = nameOf(t);
    if (!n) continue;
    if (!used.has(n)) used.set(n, []);
    used.get(n)!.push(t);
  }
  const ordered = orderGroupKeys(used, startOf);
  return [...ordered, ...suggestions.filter((s) => !used.has(s))];
}
