import { onCall, HttpsError } from "firebase-functions/v2/https";
import { CALLABLE_OPTS } from "./callable";
import { db } from "./db";
import { memberChangeDenial, ASSIGNABLE_ROLES } from "./membersPolicy";

/**
 * Settings > Identity & Authorization: change a member's role and/or project
 * access. The only way to do either -- firestore.rules no longer lets a
 * browser write another person's role or projectAccess, nor the members map.
 *
 * A role is per organization (organizations/{orgId}.members[uid]); the
 * member's profile role (users/{uid}.role) is a copy for the app to show,
 * updated here when that organization is the one they have open. Checked
 * against the members map of THIS organization (membersPolicy.ts).
 */
export const setMemberAccess = onCall({ ...CALLABLE_OPTS, timeoutSeconds: 30 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  const orgId = String(request.data?.orgId || "");
  const member = String(request.data?.memberUid || "");
  const role = request.data?.role === undefined ? undefined : String(request.data.role);
  const rawAccess = request.data?.projectAccess;
  if (!orgId || !member) throw new HttpsError("invalid-argument", "Missing organization or member.");
  if (role !== undefined && !ASSIGNABLE_ROLES.includes(role)) throw new HttpsError("invalid-argument", "Invalid role.");

  // Project access: { projectId: "read" | "write" | "none" }, for this org's projects only.
  let projectAccess: Record<string, string> | undefined;
  if (rawAccess !== undefined) {
    if (!rawAccess || typeof rawAccess !== "object") throw new HttpsError("invalid-argument", "Invalid project access.");
    const ids = Object.keys(rawAccess).slice(0, 500);
    const projects = await db.collection(`organizations/${orgId}/projects`).select().get();
    const mine = new Set(projects.docs.map((d) => d.id));
    projectAccess = {};
    for (const id of ids) {
      const v = String(rawAccess[id]);
      if (mine.has(id) && ["read", "write", "none"].includes(v)) projectAccess[id] = v;
    }
  }

  const orgRef = db.doc(`organizations/${orgId}`);
  const userRef = db.doc(`users/${member}`);
  await db.runTransaction(async (tx) => {
    const [org, profile] = await Promise.all([tx.get(orgRef), tx.get(userRef)]);
    const members: Record<string, string> = (org.data() as any)?.members || {};
    const no = memberChangeDenial({ members, caller: uid, member, role });
    if (no) throw new HttpsError("permission-denied", no);
    if (role !== undefined && role !== members[member]) tx.update(orgRef, { [`members.${member}`]: role });
    const p: any = profile.data() || {};
    const patch: Record<string, unknown> = {};
    if (role !== undefined && p.currentOrgId === orgId) patch.role = role;
    if (projectAccess) for (const [id, v] of Object.entries(projectAccess)) patch[`projectAccess.${id}`] = v;
    if (Object.keys(patch).length && profile.exists) tx.update(userRef, patch);
  });
  return { ok: true };
});
