import { FieldValue } from "firebase-admin/firestore";
import { db } from "./db";
import { assignProjectSlots, slotSummary } from "./slotSubs";

/**
 * Bring an org's slot bookkeeping up to date with its projects and the clock:
 *
 *   - which project each slot subscription pays for (slotSubs[id].projectIds)
 *   - which projects are locked because theirs has ended (billingLocked on the
 *     project, which firestore.rules reads to refuse writes)
 *   - the summary numbers firestore.rules reads for the project cap. A locked
 *     project does not count toward it: the customer has stopped paying for
 *     that one, which must not also block the next one they do pay for.
 *
 * Also what applies a downgrade: projects past the smaller plan's limit, with
 * no subscription of their own, are locked newest first (see slotSubs.ts).
 *
 * Returns the subscriptions an upgrade has made unnecessary, for the caller
 * to cancel at Razorpay (this file does not talk to Razorpay).
 *
 * Runs after every slot payment event, every project create/delete, a slot
 * cancel, and nightly (a subscription lapses by the clock, with no event).
 */
export async function refreshSlotSummary(orgId: string): Promise<{ unneeded: string[] }> {
  const ref = db.doc(`organizations/${orgId}`);
  const snap = await ref.get();
  if (!snap.exists) return { unneeded: [] };
  const org: any = snap.data();
  const projSnap = await ref.collection("projects").get();
  const projects = projSnap.docs.map((d) => {
    const c: any = (d.data() as any)?.createdAt;
    const created = typeof c === "string" ? c : c?.toDate ? c.toDate().toISOString() : d.createTime.toDate().toISOString();
    return { id: d.id, created };
  });
  const { slotSubs, locked, unneeded } = assignProjectSlots(org, projects);
  const lockedSet = new Set(locked);

  const patch: any = { ...slotSummary({ ...org, slotSubs }), projectCount: projects.length - lockedSet.size };
  if (Object.keys(slotSubs).length) patch.slotSubs = slotSubs;
  await ref.set(patch, { merge: true });

  await Promise.all(
    projSnap.docs.map((d) => {
      const want = lockedSet.has(d.id);
      const have = (d.data() as any)?.billingLocked === true;
      if (want === have) return null;
      return d.ref.update({ billingLocked: want ? true : FieldValue.delete() });
    }),
  );
  return { unneeded };
}
