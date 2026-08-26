// Ordering tasks the way the WBS shows them.
//
// Task pickers used to render whatever order Firestore returned, which is
// effectively random: a user looking for "First floor slab" had to hunt through
// an unsorted list with no idea which phase a task belonged to. Every place a
// task is chosen should present the same hierarchy the WBS does — parents
// before their children, siblings in schedule order, and each row labelled with
// the phase and location it sits under.

export interface TaskLike {
  id: string;
  parentId?: string | null;
  name: string;
  startDate?: string;
  type?: string;
  phase?: string;
  location?: string;
  isSystemGenerated?: boolean;
}

export interface WbsOrderedTask<T extends TaskLike = TaskLike> {
  task: T;
  id: string;
  name: string;
  /** Depth in the breakdown; 0 is a top-level phase. */
  level: number;
  hasChildren: boolean;
  /** Name prefixed with em-spaces, for a plain <option> that cannot nest. */
  indentedName: string;
  /** "Substructure · Block A" — the phase and location this task sits under. */
  context: string;
}

const INDENT = " "; // em space: survives in <option>, where CSS padding does not

/**
 * Flatten tasks into WBS order: depth-first, siblings sorted by start date then
 * name. Falls back gracefully when data is odd — a task whose parent is missing
 * is treated as top-level rather than being dropped, so nothing disappears from
 * a picker just because its parent was deleted.
 */
export function orderTasksByWbs<T extends TaskLike>(
  tasks: T[],
  opts: { includeSystem?: boolean } = {},
): WbsOrderedTask<T>[] {
  const usable = (tasks || []).filter(
    (t) => t && t.id && (opts.includeSystem || !t.isSystemGenerated),
  );
  const ids = new Set(usable.map((t) => t.id));

  const byParent = new Map<string, T[]>();
  for (const t of usable) {
    // An orphan (parent deleted or not loaded) is shown at root, not hidden.
    const key = t.parentId && ids.has(t.parentId) ? t.parentId : "__root__";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(t);
  }
  for (const list of byParent.values()) {
    list.sort(
      (a, b) =>
        (a.startDate || "").localeCompare(b.startDate || "") ||
        (a.name || "").localeCompare(b.name || ""),
    );
  }

  const out: WbsOrderedTask<T>[] = [];
  const walk = (parentKey: string, level: number, ancestry: string[]) => {
    if (level > 8) return; // guard against a cycle in bad data
    for (const t of byParent.get(parentKey) || []) {
      const children = byParent.get(t.id) || [];
      // Prefer the task's own phase/location; otherwise inherit from ancestors,
      // which is what a user reading the WBS would infer anyway.
      const phase = t.phase || ancestry[0] || "";
      const contextParts = [phase, t.location].filter(Boolean) as string[];
      out.push({
        task: t,
        id: t.id,
        name: t.name,
        level,
        hasChildren: children.length > 0,
        indentedName: `${INDENT.repeat(level)}${level > 0 ? "↳ " : ""}${t.name}`,
        context: contextParts.join(" · "),
      });
      walk(t.id, level + 1, [...ancestry, t.name]);
    }
  };
  walk("__root__", 0, []);
  return out;
}

/** Convenience for <option> lists: the indented name plus its phase/location. */
export function wbsOptionLabel(row: WbsOrderedTask): string {
  return row.context && row.level > 0
    ? `${row.indentedName} — ${row.context}`
    : row.indentedName;
}
