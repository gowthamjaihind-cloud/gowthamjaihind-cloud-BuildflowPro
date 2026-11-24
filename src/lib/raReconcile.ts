// Keeping RA bills and daily logs in step after a bill is certified.
//
// A certified RA bill lists the daily logs it paid for (logIds, one per daily
// log and contractor: `${dailyLogId}_${vendorId}`). Two things could still go
// wrong once a bill was certified:
//
//  1. A billed daily log is edited (more or fewer workers) or deleted. The
//     project cost changes, the bill does not, and nothing ever settled the
//     difference: under-billed, or paid for work that is gone.
//  2. A billed daily log is deleted and the same day's work entered again. The
//     new log has a new id, so the next RA bill picked it up: billed twice.
//
// Bills certified from now on also store what each log was billed at
// (logAmounts) and which contractor/task/day each covered (workKeys). From
// those, the next bill carries an adjustment for every billed log whose amount
// has changed (or that was deleted), and holds back a new log for a
// contractor/task/day that is already billed, flagging it instead.
// Bills certified before this have neither, so only case 2 can be caught for
// them, and only while the billed log still exists.

export interface BillLike {
  id: string;
  billNumber: string;
  billDate?: string;
  /** When it was certified (ISO). Orders bills certified on the same day. */
  createdAt?: string;
  isChangeOrder?: boolean;
  logIds?: string[];
  logAmounts?: Record<string, number>;
  workKeys?: string[];
}

export interface LogItemLike { taskId: string; cost: number }
export interface LogLike { id: string; vendorId: string; date: string; items: LogItemLike[] }

export interface Adjustment {
  logId: string;
  billNumber: string;
  billed: number;
  now: number;
  /** now - billed: positive goes on the next bill, negative comes off it. */
  diff: number;
  deleted: boolean;
}

export interface Reentry {
  logId: string;
  date: string;
  /** The bill that already paid for this contractor, task and day. */
  billNumber: string;
  amount: number;
}

const day = (d: string) => String(d || "").slice(0, 10);

/** A bill applies to base-contract or change-order labour; old bills (no flag) to both. */
export const billCovers = (b: BillLike, changeOrder: boolean) =>
  changeOrder ? b.isChangeOrder !== false : b.isChangeOrder !== true;

/** This log's labour of one kind (base or change order). */
export function kindAmount(log: LogLike | undefined, changeOrder: boolean, isCO: (taskId: string) => boolean): number {
  if (!log) return 0;
  return (log.items || []).filter((i) => isCO(i.taskId) === changeOrder).reduce((s, i) => s + (Number(i.cost) || 0), 0);
}

/** contractor|task|day for each task of this kind in the log. */
export function workKeysOf(log: LogLike, changeOrder: boolean, isCO: (taskId: string) => boolean): string[] {
  const tasks = new Set((log.items || []).filter((i) => isCO(i.taskId) === changeOrder).map((i) => i.taskId));
  return [...tasks].map((t) => `${log.vendorId}|${t}|${day(log.date)}`);
}

/**
 * For one contractor and one kind of labour: the adjustments due on the next
 * bill, the new logs that repeat billed work, and the logs still to bill.
 * `bills` are that contractor's certified bills, any order.
 */
export function reconcile(opts: {
  logs: LogLike[];
  bills: BillLike[];
  changeOrder: boolean;
  isCO: (taskId: string) => boolean;
}) {
  const { logs, changeOrder, isCO } = opts;
  const bills = opts.bills
    .filter((b) => billCovers(b, changeOrder))
    // Oldest first, so the latest recorded amount wins. Bill numbers end in
    // clock digits that do not sort by time, so same-day bills go by when they
    // were certified (createdAt); bills from before that field by number.
    .sort((a, b) =>
      String(a.createdAt || a.billDate || "").localeCompare(String(b.createdAt || b.billDate || "")) ||
      a.billNumber.localeCompare(b.billNumber));
  const byId = new Map(logs.map((l) => [l.id, l]));

  // The latest amount each log was billed at, by a bill that recorded it.
  const billedAt = new Map<string, { amount: number; billNumber: string }>();
  // Every log a bill has paid for, recorded amount or not.
  const billedIds = new Map<string, string>();
  // contractor|task|day already paid for, with the bill that did.
  const billedKeys = new Map<string, string>();
  for (const b of bills) {
    for (const id of b.logIds || []) {
      billedIds.set(id, b.billNumber);
      const l = byId.get(id);
      if (l) for (const k of workKeysOf(l, changeOrder, isCO)) billedKeys.set(k, b.billNumber);
    }
    for (const [id, amt] of Object.entries(b.logAmounts || {})) {
      billedAt.set(id, { amount: Number(amt) || 0, billNumber: b.billNumber });
      billedIds.set(id, b.billNumber);
    }
    for (const k of b.workKeys || []) billedKeys.set(k, b.billNumber);
  }

  const adjustments: Adjustment[] = [];
  for (const [logId, { amount, billNumber }] of billedAt) {
    const log = byId.get(logId);
    const now = kindAmount(log, changeOrder, isCO);
    const diff = Math.round((now - amount) * 100) / 100;
    if (Math.abs(diff) >= 0.5) adjustments.push({ logId, billNumber, billed: amount, now, diff, deleted: !log });
  }

  const reentries: Reentry[] = [];
  const toBill: LogLike[] = [];
  for (const l of logs) {
    if (billedIds.has(l.id)) continue;
    const amount = kindAmount(l, changeOrder, isCO);
    if (amount <= 0) continue;
    const keys = workKeysOf(l, changeOrder, isCO);
    const repeat = keys.length > 0 && keys.every((k) => billedKeys.has(k));
    if (repeat) reentries.push({ logId: l.id, date: day(l.date), billNumber: billedKeys.get(keys[0])!, amount });
    else toBill.push(l);
  }

  const adjustmentTotal = Math.round(adjustments.reduce((s, a) => s + a.diff, 0) * 100) / 100;
  return { adjustments, adjustmentTotal, reentries, toBill };
}

/** What a new bill records for the logs it settles: their amount now, and their work keys. */
export function billRecord(
  newLogs: LogLike[],
  adjustments: Adjustment[],
  changeOrder: boolean,
  isCO: (taskId: string) => boolean,
) {
  const logAmounts: Record<string, number> = {};
  const workKeys: string[] = [];
  for (const l of newLogs) {
    logAmounts[l.id] = kindAmount(l, changeOrder, isCO);
    workKeys.push(...workKeysOf(l, changeOrder, isCO));
  }
  for (const a of adjustments) logAmounts[a.logId] = a.now;
  return { logAmounts, workKeys };
}

/** The certified bills that include a daily log (any contractor on it). */
export function billsForDailyLog<T extends BillLike>(dailyLogId: string, bills: T[]): T[] {
  const prefix = `${dailyLogId}_`;
  return bills.filter((b) => (b.logIds || []).some((id) => id.startsWith(prefix)) || Object.keys(b.logAmounts || {}).some((id) => id.startsWith(prefix)));
}

// ---------------------------------------------------------------------------
// A contractor's RA statement: what is certified, on which bill, and what is
// still to be certified (RA Billing > click a contractor).

export interface StatementLogLike extends LogLike {
  items: (LogItemLike & { taskName?: string; role?: string; headcount?: number })[];
}

export interface StatementLine {
  logId: string;
  date: string;
  tasks: string;
  /** "Mason × 4, Helper × 6" */
  crew: string;
  amount: number;
  changeOrder: boolean;
  /** On a bill, the log has since been deleted. */
  deleted?: boolean;
}

export interface StatementBill<B extends BillLike = BillLike> {
  bill: B;
  lines: StatementLine[];
}

function lineOf(log: StatementLogLike, changeOrder: boolean, isCO: (t: string) => boolean): StatementLine {
  const items = (log.items || []).filter((i) => isCO(i.taskId) === changeOrder);
  const tasks = [...new Set(items.map((i) => i.taskName || i.taskId))].join(", ");
  const crew = items.map((i) => `${i.role || "Labour"} × ${Number(i.headcount) || 0}`).join(", ");
  return { logId: log.id, date: day(log.date), tasks, crew, amount: kindAmount(log, changeOrder, isCO), changeOrder };
}

/**
 * Everything for one contractor: the logs still to certify (both kinds, in
 * the period if one is set), the adjustments and held-back repeats, and each
 * certified bill with the logs it paid for (at the amount billed when the
 * bill recorded it, else today's). Newest bill first; lines oldest first.
 */
export function vendorStatement<B extends BillLike & { netAmount?: number }>(opts: {
  logs: StatementLogLike[];
  bills: B[];
  isCO: (taskId: string) => boolean;
  inPeriod?: (date: string) => boolean;
}) {
  const { logs, bills, isCO } = opts;
  const inPeriod = opts.inPeriod || (() => true);
  const byId = new Map(logs.map((l) => [l.id, l]));
  const unbilled: StatementLine[] = [];
  const adjustments: (Adjustment & { changeOrder: boolean })[] = [];
  const reentries: (Reentry & { changeOrder: boolean })[] = [];
  for (const changeOrder of [false, true]) {
    const r = reconcile({ logs, bills, changeOrder, isCO });
    for (const l of r.toBill) if (inPeriod(day(l.date))) unbilled.push(lineOf(l as StatementLogLike, changeOrder, isCO));
    adjustments.push(...r.adjustments.map((a) => ({ ...a, changeOrder })));
    reentries.push(...r.reentries.map((x) => ({ ...x, changeOrder })));
  }
  unbilled.sort((a, b) => a.date.localeCompare(b.date));

  const certified: StatementBill<B>[] = [...bills]
    .sort((a, b) => String(b.createdAt || b.billDate || "").localeCompare(String(a.createdAt || a.billDate || "")) || b.billNumber.localeCompare(a.billNumber))
    .map((bill) => {
      // Legacy bills (no flag) covered both kinds.
      const kinds = bill.isChangeOrder === true ? [true] : bill.isChangeOrder === false ? [false] : [false, true];
      const ids = [...new Set([...(bill.logIds || []), ...Object.keys(bill.logAmounts || {})])];
      const lines: StatementLine[] = [];
      for (const id of ids) {
        const log = byId.get(id) as StatementLogLike | undefined;
        const recorded = bill.logAmounts?.[id];
        if (!log) {
          lines.push({ logId: id, date: "", tasks: "", crew: "", amount: Number(recorded) || 0, changeOrder: bill.isChangeOrder === true, deleted: true });
          continue;
        }
        for (const k of kinds) {
          const line = lineOf(log, k, isCO);
          if (recorded !== undefined) line.amount = Number(recorded) || 0;
          if (line.amount || recorded !== undefined) lines.push(line);
        }
      }
      lines.sort((a, b) => a.date.localeCompare(b.date));
      return { bill, lines };
    });

  const sum = (xs: { amount: number }[]) => Math.round(xs.reduce((s, x) => s + (Number(x.amount) || 0), 0) * 100) / 100;
  return {
    unbilled,
    unbilledTotal: sum(unbilled),
    adjustments,
    adjustmentTotal: Math.round(adjustments.reduce((s, a) => s + a.diff, 0) * 100) / 100,
    reentries,
    certified,
    certifiedTotal: Math.round(bills.reduce((s, b) => s + (Number(b.netAmount) || 0), 0) * 100) / 100,
  };
}
