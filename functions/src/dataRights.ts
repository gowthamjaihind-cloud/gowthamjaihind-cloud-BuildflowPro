import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import { db } from "./db";

// ---------------------------------------------------------------------------
// Data-subject rights (DPDP / GDPR): export and erasure, built into the app so
// users don't have to email us to exercise them. All three run with the Admin
// SDK (bypassing security rules) but each enforces its own authorization.
// ---------------------------------------------------------------------------

// Roughly the callable response ceiling; keep a margin under Firestore/Functions
// limits. A larger tenant is directed to email for an out-of-band export.
const MAX_EXPORT_BYTES = 8 * 1024 * 1024;

// Read every project (and its two-level-deep sub-collections) under an org.
// Mirrors the layout the migration copies: organizations/{orgId}/projects/{id}/{collection}/{doc}.
async function readOrgProjects(orgRef: FirebaseFirestore.DocumentReference) {
  const projects: any[] = [];
  const projRefs = await orgRef.collection("projects").listDocuments();
  for (const p of projRefs) {
    const ps = await p.get();
    const entry: any = { id: p.id, data: ps.exists ? ps.data() : null, collections: {} };
    const subs = await p.listCollections();
    await Promise.all(
      subs.map(async (sub) => {
        const qs = await sub.get();
        entry.collections[sub.id] = qs.docs.map((d) => ({ id: d.id, ...d.data() }));
      }),
    );
    projects.push(entry);
  }
  return projects;
}

// Download a machine-readable copy of the caller's data. Always includes the
// personal profile; includes the full organization dataset only when the caller
// is an Owner or Admin of their current org (they control that tenant's data).
export const exportMyData = onCall({ timeoutSeconds: 300, memory: "512MiB" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const uid = request.auth.uid;

  const userSnap = await db.doc(`users/${uid}`).get();
  const profile = userSnap.exists ? userSnap.data() : null;

  const bundle: any = {
    schema: "sitetru.export.v1",
    exportedAt: new Date().toISOString(),
    account: { uid, ...(profile || {}) },
    organization: null,
  };

  const orgId = (profile as any)?.currentOrgId;
  if (orgId) {
    const orgRef = db.doc(`organizations/${orgId}`);
    const orgSnap = await orgRef.get();
    if (orgSnap.exists) {
      const orgData: any = orgSnap.data() || {};
      const role = orgData.members?.[uid];
      if (role === "Owner" || role === "Admin") {
        const projects = await readOrgProjects(orgRef);
        const usage: any[] = [];
        const usageSnap = await orgRef.collection("usage").get();
        usageSnap.forEach((u) => usage.push({ id: u.id, ...u.data() }));
        bundle.organization = { id: orgId, ...orgData, projects, usage };
      } else {
        bundle.organization = {
          id: orgId,
          companyName: orgData.companyName || null,
          yourRole: role || null,
          note:
            "A full organization export is available to Owners and Admins. Your personal profile is included above; ask your organization's Owner for a complete export.",
        };
      }
    }
  }

  // Guard the response size — a very large tenant can exceed the callable limit.
  const size = Buffer.byteLength(JSON.stringify(bundle), "utf8");
  if (size > MAX_EXPORT_BYTES) {
    throw new HttpsError(
      "resource-exhausted",
      "Your organization's data is too large to export in one request. Email privacy@sitetru.com and we'll prepare a full export for you.",
    );
  }

  return bundle;
});

async function removeOrgFromMembers(orgId: string, memberUids: string[]) {
  await Promise.all(
    memberUids.map(async (m) => {
      const uref = db.doc(`users/${m}`);
      const us = await uref.get();
      if (!us.exists) return;
      const ud: any = us.data() || {};
      const patch: any = { orgIds: FieldValue.arrayRemove(orgId) };
      if (ud.currentOrgId === orgId) {
        const remaining = (ud.orgIds || []).filter((x: string) => x !== orgId);
        patch.currentOrgId = remaining[0] || FieldValue.delete();
      }
      await uref.set(patch, { merge: true });
    }),
  );
}

async function deletePendingInvites(orgId: string) {
  const invites = await db.collection("org_invites").where("orgId", "==", orgId).get();
  await Promise.all(invites.docs.map((d) => d.ref.delete()));
}

// Permanently delete an organization and ALL of its data. Owner-only. Removes
// the org from every member's account and deletes pending invites. Irreversible.
export const deleteOrganization = onCall({ timeoutSeconds: 300, memory: "512MiB" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const uid = request.auth.uid;
  const orgId = String(request.data?.orgId || "").trim();
  if (!orgId) throw new HttpsError("invalid-argument", "orgId is required.");

  const orgRef = db.doc(`organizations/${orgId}`);
  const snap = await orgRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "Organization not found.");

  const data: any = snap.data() || {};
  const members: Record<string, string> = data.members || {};
  if (members[uid] !== "Owner") {
    throw new HttpsError("permission-denied", "Only an Owner can delete the organization.");
  }

  const memberUids = Object.keys(members);

  // recursiveDelete removes the org document and every descendant (projects and
  // all their sub-collections, usage meters, etc.).
  await db.recursiveDelete(orgRef);
  await removeOrgFromMembers(orgId, memberUids);
  await deletePendingInvites(orgId);

  return { ok: true, orgId, unlinkedMembers: memberUids.length };
});

// Permanently delete the caller's own account: their profile, their Auth record,
// their Telegram link codes, and their membership in every organization. If they
// are the sole member of an org, that org is deleted too. If they are the only
// Owner of an org that still has other members, deletion is blocked until they
// transfer ownership, remove the members, or delete the org. Irreversible.
export const deleteMyAccount = onCall({ timeoutSeconds: 300 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const uid = request.auth.uid;

  const userRef = db.doc(`users/${uid}`);
  const userSnap = await userRef.get();
  const orgIds: string[] = userSnap.exists ? (userSnap.data() as any)?.orgIds || [] : [];

  // First pass: detect orgs where the caller is the last Owner but others remain.
  const blocking: string[] = [];
  const orgStates: { orgId: string; members: Record<string, string> }[] = [];
  for (const orgId of orgIds) {
    const os = await db.doc(`organizations/${orgId}`).get();
    if (!os.exists) continue;
    const members: Record<string, string> = (os.data() as any)?.members || {};
    orgStates.push({ orgId, members });
    if (members[uid] === "Owner") {
      const owners = Object.entries(members).filter(([, r]) => r === "Owner").map(([u]) => u);
      const others = Object.keys(members).filter((u) => u !== uid);
      if (others.length > 0 && owners.length === 1) {
        blocking.push((os.data() as any)?.companyName || orgId);
      }
    }
  }
  if (blocking.length > 0) {
    throw new HttpsError(
      "failed-precondition",
      `You are the only Owner of ${blocking.join(", ")}. Transfer ownership to another member, remove the other members, or delete the organization before deleting your account.`,
    );
  }

  // Second pass: leave or delete each org.
  for (const { orgId, members } of orgStates) {
    const oref = db.doc(`organizations/${orgId}`);
    const others = Object.keys(members).filter((u) => u !== uid);
    if (others.length === 0) {
      await db.recursiveDelete(oref);
      await deletePendingInvites(orgId);
    } else {
      // Remove only my membership key; the rest of the tenant is untouched.
      await oref.set({ members: { [uid]: FieldValue.delete() } }, { merge: true });
    }
  }

  // Telegram link codes the user created.
  const codes = await db.collection("bot_link_codes").where("userId", "==", uid).get();
  await Promise.all(codes.docs.map((d) => d.ref.delete()));

  // Profile, then the Auth identity itself.
  await userRef.delete().catch(() => undefined);
  try {
    await admin.auth().deleteUser(uid);
  } catch (e) {
    // The Firestore data is already gone; surface a soft failure so the client
    // can prompt the user to sign out. (e.g. auth/user-not-found is fine.)
    return { ok: true, authDeleted: false };
  }

  return { ok: true, authDeleted: true };
});
