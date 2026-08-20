import { onSchedule } from "firebase-functions/v2/scheduler";
import { db } from "./db";
import { captureError } from "./sentry";

// Housekeeping for abandoned pay-now signups.
//
// The self-serve pay-now flow creates an organization UNLINKED (no member has
// it as their currentOrgId) and marks it `pendingPayment: true`. If the user
// closes the Razorpay window without paying, that org just sits there — nobody
// can reach it, but it's clutter. Payment activation clears the flag, so any
// org still carrying `pendingPayment` after a grace period is a dead checkout.
//
// This runs daily and recursively deletes pending-payment orgs older than the
// grace window. It only ever touches orgs still flagged pendingPayment, so a
// paid or free org is never at risk.

const GRACE_MS = 24 * 60 * 60 * 1000; // delete abandoned checkouts after 24h

export const cleanupAbandonedSignups = onSchedule(
  {
    schedule: "30 3 * * *", // 03:30 daily (quiet hours) in the timezone below
    timeZone: "Asia/Kolkata",
    region: "asia-southeast1",
  },
  async () => {
    const cutoff = Date.now() - GRACE_MS;
    const snap = await db
      .collection("organizations")
      .where("pendingPayment", "==", true)
      .get();

    let deleted = 0;
    for (const doc of snap.docs) {
      const d: any = doc.data();
      // createdAt is an ISO string; guard against a missing/garbage value by
      // treating an unparseable date as "not yet old enough" (skip, don't delete).
      const createdMs = Date.parse(d.createdAt || "");
      if (!Number.isFinite(createdMs) || createdMs > cutoff) continue;
      try {
        await db.recursiveDelete(doc.ref);
        deleted++;
      } catch (err) {
        console.error("Failed to delete abandoned signup org", doc.id, err);
        captureError(err, { where: "cleanupAbandonedSignups", orgId: doc.id });
      }
    }
    console.log(`Abandoned-signup cleanup: deleted ${deleted}/${snap.size} pending-payment orgs.`);
  },
);
