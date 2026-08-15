import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "./db";

// One-time, admin-only migration from the legacy single-tenant layout
// (projects/*) to the multi-tenant layout (organizations/{orgId}/projects/*).
//
// It creates the organization with the caller seeded as Owner (the membership
// the security rules check), COPIES every legacy project and its sub-collections
// under the new org, and links the caller's account (users/{uid}.currentOrgId).
// Legacy data is left untouched as a backup, so the operation is reversible.
// Runs with the Admin SDK, so it bypasses rules.
//
// Resume-safe: if a previous run created the org but didn't finish linking the
// account (e.g. the client timed out), a re-run adopts that same org and
// re-copies (overwrite) rather than creating a duplicate.
export const setupOrganization = onCall(
  { timeoutSeconds: 540, memory: "1GiB" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
    const uid = request.auth.uid;

    const userRef = db.doc(`users/${uid}`);
    const userSnap = await userRef.get();
    if (!userSnap.exists) throw new HttpsError("failed-precondition", "No user profile found.");
    const userData = userSnap.data() as any;

    const allowed = ["Owner", "Admin"];
    const tokenRole = (request.auth.token as any)?.role;
    if (!allowed.includes(userData.role) && !allowed.includes(tokenRole)) {
      throw new HttpsError("permission-denied", "Only an Owner or Admin can set up the organization.");
    }

    // Already linked → nothing to do.
    if (userData.currentOrgId) {
      return { orgId: userData.currentOrgId, alreadyLinked: true, projects: 0, docs: 0 };
    }

    const companyName =
      (request.data && String(request.data.companyName || "").trim()) ||
      userData.displayName ||
      "My Company";

    // Adopt an org this user already started (a prior interrupted run), else
    // create a fresh one. Avoids duplicate orgs on retry.
    const existing = await db
      .collection("organizations")
      .where("createdByUid", "==", uid)
      .limit(1)
      .get();
    const orgRef = existing.empty ? db.collection("organizations").doc() : existing.docs[0].ref;
    const orgId = orgRef.id;

    await orgRef.set(
      {
        companyName,
        members: { [uid]: "Owner" },
        createdAt: new Date().toISOString(),
        createdByUid: uid,
        migratedFromLegacy: true,
      },
      { merge: true },
    );

    // Fast copy. This app's Firestore is two levels deep under a project
    // (projects/{id}/{collection}/{doc}) — no sub-sub-collections — so we read
    // each sub-collection in a single batched .get() instead of walking every
    // document with listCollections() (which caused the timeout).
    const counters = { projects: 0, docs: 0 };
    const writer = db.bulkWriter();

    const legacyProjectRefs = await db.collection("projects").listDocuments();
    for (const projRef of legacyProjectRefs) {
      counters.projects++;
      const destProjRef = orgRef.collection("projects").doc(projRef.id);

      const projSnap = await projRef.get();
      if (projSnap.exists) {
        writer.set(destProjRef, projSnap.data() as FirebaseFirestore.DocumentData);
        counters.docs++;
      }

      const subs = await projRef.listCollections();
      await Promise.all(
        subs.map(async (sub) => {
          const qs = await sub.get();
          qs.forEach((docSnap) => {
            writer.set(
              destProjRef.collection(sub.id).doc(docSnap.id),
              docSnap.data() as FirebaseFirestore.DocumentData,
            );
            counters.docs++;
          });
        }),
      );
    }

    await writer.close();

    // Link the caller's account to the org (switches the app to the org path)
    // and record membership for the org-switcher.
    await userRef.set(
      { currentOrgId: orgId, orgIds: FieldValue.arrayUnion(orgId) },
      { merge: true },
    );

    return { orgId, alreadyLinked: false, projects: counters.projects, docs: counters.docs };
  },
);
