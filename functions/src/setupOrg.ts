import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "./db";

// One-time, admin-only migration from the legacy single-tenant layout
// (projects/*) to the multi-tenant layout (organizations/{orgId}/projects/*).
//
// It creates the organization with the caller seeded as Owner (the membership
// the security rules check), COPIES every legacy project and all of its nested
// sub-collections under the new org, and links the caller's account
// (users/{uid}.currentOrgId). Legacy data is left untouched as a backup, so the
// operation is reversible. Runs with the Admin SDK, so it bypasses rules.
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

    // Idempotent: if already linked, do nothing (prevents a second org + re-copy).
    if (userData.currentOrgId) {
      return { orgId: userData.currentOrgId, alreadyLinked: true, projects: 0, docs: 0 };
    }

    const companyName =
      (request.data && String(request.data.companyName || "").trim()) ||
      userData.displayName ||
      "My Company";

    // Create the org, seeding the caller as Owner in the members map.
    const orgRef = db.collection("organizations").doc();
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

    // Recursively copy a document and every nested sub-collection.
    const counters = { projects: 0, docs: 0 };
    const writer = db.bulkWriter();

    async function copyInto(
      srcRef: FirebaseFirestore.DocumentReference,
      destRef: FirebaseFirestore.DocumentReference,
    ) {
      const snap = await srcRef.get();
      if (snap.exists) {
        writer.set(destRef, snap.data() as FirebaseFirestore.DocumentData);
        counters.docs++;
      }
      // listCollections finds sub-collections; listDocuments includes "missing"
      // container docs that only exist to hold sub-collections.
      const subs = await srcRef.listCollections();
      for (const sub of subs) {
        const childRefs = await sub.listDocuments();
        for (const childRef of childRefs) {
          await copyInto(childRef, destRef.collection(sub.id).doc(childRef.id));
        }
      }
    }

    const legacyProjectRefs = await db.collection("projects").listDocuments();
    for (const projRef of legacyProjectRefs) {
      counters.projects++;
      await copyInto(projRef, orgRef.collection("projects").doc(projRef.id));
    }

    await writer.close();

    // Link the caller's account to the new org (switches the app to the org path).
    await userRef.update({ currentOrgId: orgId });

    return { orgId, alreadyLinked: false, projects: counters.projects, docs: counters.docs };
  },
);
