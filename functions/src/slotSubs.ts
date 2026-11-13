/**
 * Recurring project slots: the bookkeeping, free of the Admin SDK.
 *
 * An extra project slot used to be a one-off ₹99 order that lapsed after 30
 * days unless someone remembered to buy it again. It is now its own Razorpay
 * SUBSCRIPTION, separate from the plan's:
 *
 *   - Separate, because Razorpay cannot change the amount of a subscription
 *     authorised over UPI AutoPay ("subscriptions cannot be updated when
 *     payment mode is UPI"), and UPI is how most ₹99 customers pay. CREATING a
 *     subscription has no such limit, so each purchase of slots is a new one,
 *     with the quantity fixed at creation.
 *   - One per purchase rather than one per org: adding a slot later must not
 *     disturb the mandate already running for the earlier ones.
 *
 * Each lives on the org as slotSubs[subscriptionId] = { qty, until, status }.
 * `until` is Razorpay's own current_end for the cycle paid for; a slot counts
 * while that has not passed (plus a short grace for a late webhook or retry).
 *
 * Two summary fields are kept beside the map for firestore.rules, which can
 * read numbers but cannot sum a map:
 *
 *   recurringSlots       slots live at the last recompute
 *   recurringSlotsUntil  the LATEST moment any of them lapses
 *
 * Latest, not earliest, so the rule errs toward the paying customer; the
 * nightly job recomputes, so a lapsed subscription is over-counted for at most
 * a day and only for creating NEW projects.
 */

export type SlotSubStatus = "active" | "cancelling" | "cancelled" | "halted";

export interface SlotSub {
  qty: number;
  /** Epoch ms: end of the cycle already paid for. 0 until the first charge. */
  until: number;
  status: SlotSubStatus;
  /**
   * The projects this subscription pays for (at most `qty`). Set by
   * assignProjectSlots when a project is created past the plan's own cap, so
   * the customer can see WHICH project a ₹99 line is for, cancel that one, and
   * so the project -- not just "capacity" -- stops when the money does.
   */
  projectIds?: string[];
}

/** A late webhook or a card retry should not take a paid project away. */
export const SLOT_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function subsOf(org: any): Record<string, SlotSub> {
  const m = org?.slotSubs;
  return m && typeof m === "object" ? (m as Record<string, SlotSub>) : {};
}

/** Is this subscription's slot capacity in force right now? */
export function slotSubLive(s: SlotSub | undefined, now = Date.now()): boolean {
  if (!s || !(num(s.qty) > 0) || !(num(s.until) > 0)) return false;
  // A cancelled subscription has no retry coming, so no grace: it ends when
  // the paid cycle ends. Everything else gets the grace window.
  const grace = s.status === "cancelled" || s.status === "cancelling" ? 0 : SLOT_GRACE_MS;
  return s.until + grace > now;
}

/** Slots in force from recurring subscriptions. */
export function recurringSlots(org: any, now = Date.now()): number {
  return Object.values(subsOf(org)).reduce((n, s) => n + (slotSubLive(s, now) ? Math.floor(num(s.qty)) : 0), 0);
}

/** The two fields firestore.rules reads. */
export function slotSummary(org: any, now = Date.now()): { recurringSlots: number; recurringSlotsUntil: number } {
  let slots = 0;
  let until = 0;
  for (const s of Object.values(subsOf(org))) {
    if (!slotSubLive(s, now)) continue;
    slots += Math.floor(num(s.qty));
    const grace = s.status === "cancelled" || s.status === "cancelling" ? 0 : SLOT_GRACE_MS;
    until = Math.max(until, s.until + grace);
  }
  return { recurringSlots: slots, recurringSlotsUntil: until };
}

const toMs = (unixSeconds: unknown) => {
  const n = Number(unixSeconds);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) : 0;
};

/**
 * The slotSubs entry after a Razorpay subscription event, or null to leave it
 * alone. Mirrors rzpSubscription.subscriptionPatch's decisions:
 *
 *   charged / activated   paid: live through Razorpay's current_end
 *   pending               a charge failed and Razorpay is retrying: change
 *                         nothing, the customer has lost nothing yet
 *   halted                retries exhausted: stop extending; it lapses when
 *                         the paid cycle (plus grace) runs out
 *   cancelled / completed no further charges: keep what was paid for
 *   created/authenticated a mandate, not money: grants nothing
 */
export function slotSubAfterEvent(event: string, entity: any, existing: SlotSub | undefined, qtyHint: number): SlotSub | null {
  const qty = Math.max(0, Math.floor(Number(entity?.quantity) || 0)) || Math.max(0, Math.floor(num(existing?.qty))) || Math.max(0, Math.floor(qtyHint || 0));
  const end = toMs(entity?.current_end);
  const prior = num(existing?.until);

  if (event === "subscription.charged" || event === "subscription.activated") {
    // Never move `until` backwards: events can arrive out of order.
    return { ...(existing || {}), qty, until: Math.max(prior, end), status: existing?.status === "cancelling" ? "cancelling" : "active" };
  }
  if (event === "subscription.halted" || event === "subscription.paused") {
    return existing ? { ...existing, qty, status: "halted" } : null;
  }
  if (event === "subscription.cancelled" || event === "subscription.completed") {
    return existing ? { ...existing, qty, status: "cancelled" } : null;
  }
  return null;
}

/** Subscriptions worth trying to cancel at Razorpay when the plan itself ends. */
export function cancellableSlotSubs(org: any): string[] {
  return Object.entries(subsOf(org)).filter(([, s]) => s.status === "active" || s.status === "halted").map(([id]) => id);
}


export interface ProjectRef {
  id: string;
  /** Sortable creation key (ISO string or similar); older sorts first. */
  created: string;
}

/**
 * Decide which project each slot subscription pays for, and which projects are
 * locked because theirs has ended.
 *
 *   - The plan's own projects are the OLDEST ones not tied to a subscription,
 *     up to the plan's cap (plus any one-off slots still inside their window).
 *   - A project created past that is tied to a live subscription with room.
 *   - A project whose subscription is no longer live is LOCKED (read-only),
 *     unless the plan itself has room for it again -- then it is released
 *     back into the plan rather than held hostage.
 *   - A project past the cap with no subscription at all (older data, a
 *     downgrade) is left alone: unassigned and unlocked.
 *
 * Pure. An uncapped plan releases everything.
 */
export function assignProjectSlots(
  org: any,
  projects: ProjectRef[],
  now = Date.now(),
): { slotSubs: Record<string, SlotSub>; locked: string[] } {
  const exists = new Set(projects.map((p) => p.id));
  const order = [...projects].sort((a, b) => (a.created < b.created ? -1 : a.created > b.created ? 1 : a.id < b.id ? -1 : 1));
  const rank = new Map(order.map((p, i) => [p.id, i]));
  const subs: Record<string, SlotSub> = {};
  const taken = new Set<string>();
  // Live subscriptions claim first, so a project named by both a dead and a
  // live one (a re-subscribe) belongs to the live one.
  const ids = Object.keys(subsOf(org)).sort((a, b) => Number(slotSubLive(subsOf(org)[b], now)) - Number(slotSubLive(subsOf(org)[a], now)) || (a < b ? -1 : 1));
  for (const id of ids) {
    const src = subsOf(org)[id];
    const qty = Math.max(0, Math.floor(num(src.qty)));
    const mine: string[] = [];
    for (const pid of Array.isArray(src.projectIds) ? src.projectIds : []) {
      if (mine.length >= qty || !exists.has(pid) || taken.has(pid)) continue;
      mine.push(pid);
      taken.add(pid);
    }
    subs[id] = { ...src, projectIds: mine };
  }

  const cap = org?.includedProjects;
  if (typeof cap !== "number") {
    for (const id of Object.keys(subs)) subs[id].projectIds = [];
    return { slotSubs: subs, locked: [] };
  }
  const oneOff = num(org?.slotsExpireAt) > now ? Math.max(0, Math.floor(num(org?.purchasedSlots))) : 0;
  const base = cap + oneOff;

  let free = order.filter((p) => !taken.has(p.id)).map((p) => p.id);
  // Room in the plan itself: release locked projects into it, oldest first.
  let room = base - free.length;
  if (room > 0) {
    const dead = Object.keys(subs)
      .filter((id) => !slotSubLive(subs[id], now))
      .flatMap((id) => (subs[id].projectIds || []).map((pid) => ({ id, pid })))
      .sort((a, b) => (rank.get(a.pid) ?? 0) - (rank.get(b.pid) ?? 0));
    for (const d of dead) {
      if (room <= 0) break;
      subs[d.id].projectIds = (subs[d.id].projectIds || []).filter((x) => x !== d.pid);
      taken.delete(d.pid);
      room--;
    }
    free = order.filter((p) => !taken.has(p.id)).map((p) => p.id);
  }
  // Past the plan's cap: tie each to a live subscription that has room.
  const overflow = free.slice(base);
  const liveIds = Object.keys(subs).filter((id) => slotSubLive(subs[id], now)).sort();
  for (const pid of overflow) {
    const home = liveIds.find((id) => (subs[id].projectIds || []).length < Math.floor(num(subs[id].qty)));
    if (!home) break;
    subs[home].projectIds = [...(subs[home].projectIds || []), pid];
  }
  const locked = Object.keys(subs)
    .filter((id) => !slotSubLive(subs[id], now))
    .flatMap((id) => subs[id].projectIds || []);
  return { slotSubs: subs, locked };
}
