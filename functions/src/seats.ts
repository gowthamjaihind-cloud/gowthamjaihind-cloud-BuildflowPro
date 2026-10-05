/**
 * Seat accounting for an organization's user limit.
 *
 * `userLimit` has been written onto every org doc since the plan catalog
 * shipped, and `Paywall.tsx` and `ManagePlanModal.tsx` both advertise it as a
 * number of users -- but nothing ever checked it. An org on a 10-user plan
 * could invite a hundred people and the only hint was the pricing page.
 *
 * Two places have to agree, and they check different things:
 *
 *   createInvite  counts members PLUS invites that are still redeemable, and
 *                 refuses to mint a code there is no room for. Without the
 *                 pending half, an org one seat from its limit can mint ten
 *                 codes and every one of them is valid: invites live for 14
 *                 days and are not atomic with joining, so the cap is only a
 *                 cap if unredeemed codes are reserved against it.
 *
 *   acceptInvite  counts members only, and is the authoritative gate, because
 *                 that is the moment a seat is actually taken. A code minted
 *                 while there was room can still arrive after the room is
 *                 gone -- two people holding codes, one seat left.
 *
 * Checking only at mint time is gameable; checking only at redeem time pushes
 * the failure onto the teammate, who cannot do anything about it. Hence both.
 *
 * Kept pure -- no `db` import -- so these rules are testable without an
 * initialised admin app. `channel.ts` is pure for the same reason.
 */

/** No seat cap: Enterprise (explicit null) or an org never placed on a plan. */
export type SeatLimit = number | null;

/**
 * The org's seat cap, or null for "no cap".
 *
 * An ABSENT `userLimit` means no cap, matching how `includedProjectsOf` reads
 * an absent `includedProjects`. That convention is what keeps grandfathered,
 * operator and trialing orgs from being locked out of their own workspace by a
 * limit nobody set on them -- so a missing field must never read as zero.
 */
export function seatLimitOf(orgData: any): SeatLimit {
  const n = orgData?.userLimit;
  if (typeof n === "number" && Number.isFinite(n) && n > 0) return Math.floor(n);
  return null;
}

/** How many seats the members map is using. */
export function seatsUsed(orgData: any): number {
  const members = orgData?.members;
  if (!members || typeof members !== "object") return 0;
  return Object.keys(members).length;
}

/** Is this uid already in the org? An existing member retakes no seat. */
export function isMember(orgData: any, uid: string): boolean {
  const members = orgData?.members;
  return !!members && typeof members === "object" && Object.prototype.hasOwnProperty.call(members, uid);
}

/**
 * Invites that could still be redeemed, and so still hold a seat.
 *
 * A used or expired code cannot take a seat, so counting it would shrink the
 * org's usable capacity every time someone let an invite lapse.
 */
export function pendingInvites(invites: any[], now = Date.now()): number {
  let n = 0;
  for (const inv of invites ?? []) {
    if (!inv || inv.used) continue;
    const expires = Number(inv.expiresAt) || 0;
    if (expires && now > expires) continue;
    n++;
  }
  return n;
}

export interface SeatState {
  /** false when the seats being asked for do not fit. */
  ok: boolean;
  limit: SeatLimit;
  /** Seats already committed: members, plus reserved invites where counted. */
  taken: number;
  /** Seats left, or null when there is no cap. */
  remaining: number | null;
}

/**
 * Does `adding` more seats fit?
 *
 * `reserved` is the pending-invite count at mint time and 0 at redeem time --
 * see the header for why those differ.
 */
export function seatState(
  orgData: any,
  opts: { adding?: number; reserved?: number } = {},
): SeatState {
  const limit = seatLimitOf(orgData);
  const adding = Math.max(0, Math.floor(opts.adding ?? 1));
  const taken = seatsUsed(orgData) + Math.max(0, Math.floor(opts.reserved ?? 0));
  if (limit === null) return { ok: true, limit, taken, remaining: null };
  return { ok: taken + adding <= limit, limit, taken, remaining: Math.max(0, limit - taken) };
}

/**
 * The message an Owner sees when the cap is reached.
 *
 * It names the number they are on, because "seat limit reached" without the
 * number sends them to the pricing page to work out which plan they are even
 * on.
 */
export function seatLimitMessage(state: SeatState, what: "invite" | "join"): string {
  const limit = state.limit ?? 0;
  const who = what === "invite" ? "invite anyone else" : "join";
  return (
    `This workspace is using all ${limit} of its user seats, so you can't ${who} right now. ` +
    `Remove a member you no longer need, or move to a plan with more seats.`
  );
}
