import { onCall, HttpsError } from "firebase-functions/v2/https";
import { randomBytes } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "./db";
import { sendInviteEmail, APP_URL } from "./email";

// Roles a teammate can be invited as. "Owner" is intentionally excluded — an
// org has exactly one owner (the creator), and you don't invite people as Owner.
const INVITABLE_ROLES = ["Admin", "Project Manager", "Site Engineer", "Stakeholder", "Viewer"];
const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

const genCode = () => randomBytes(6).toString("hex").toUpperCase(); // 12 hex chars

// Owner/Admin of an org mints an invite code for a teammate.
// Returns a code the owner shares as a link (…/?invite=CODE) or verbally.
export const createInvite = onCall({ timeoutSeconds: 60 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const uid = request.auth.uid;
  const email = String(request.data?.email || "").trim().toLowerCase();
  const role = String(request.data?.role || "Viewer");
  if (!INVITABLE_ROLES.includes(role)) throw new HttpsError("invalid-argument", "Invalid role.");

  const userSnap = await db.doc(`users/${uid}`).get();
  const orgId = userSnap.exists ? (userSnap.data() as any).currentOrgId : undefined;
  if (!orgId) throw new HttpsError("failed-precondition", "You're not part of an organization.");

  const orgSnap = await db.doc(`organizations/${orgId}`).get();
  const orgData = orgSnap.data() as any;
  const members = orgData?.members || {};
  if (!["Owner", "Admin"].includes(members[uid])) {
    throw new HttpsError("permission-denied", "Only an Owner or Admin can invite teammates.");
  }

  const code = genCode();
  await db.doc(`org_invites/${code}`).set({
    code,
    orgId,
    orgName: orgData?.companyName || "",
    email: email || null,
    role,
    invitedByUid: uid,
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + INVITE_TTL_MS,
    used: false,
  });

  // If a recipient email was given, mail the link directly (best-effort).
  const emailResult = await sendInviteEmail({
    to: email || null,
    orgName: orgData?.companyName || "your organization",
    role,
    link: `${APP_URL}/?invite=${code}`,
    inviterName: (userSnap.data() as any)?.displayName || undefined,
  });

  return {
    code,
    orgId,
    role,
    email: email || null,
    emailed: emailResult.sent,
    emailError: emailResult.sent ? null : emailResult.error || null,
  };
});

// A signed-in user redeems an invite code and joins the org with the invited
// role. Runs with the Admin SDK, so it can write the org's members map and the
// user's profile even though the caller isn't a member yet.
export const acceptInvite = onCall({ timeoutSeconds: 60 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const uid = request.auth.uid;
  const code = String(request.data?.code || "").trim().toUpperCase();
  if (!code) throw new HttpsError("invalid-argument", "Enter an invite code.");

  const inviteRef = db.doc(`org_invites/${code}`);
  const inviteSnap = await inviteRef.get();
  if (!inviteSnap.exists) throw new HttpsError("not-found", "That invite code isn't valid.");
  const invite = inviteSnap.data() as any;
  if (invite.used) throw new HttpsError("failed-precondition", "That invite has already been used.");
  if (invite.expiresAt && Date.now() > invite.expiresAt) {
    throw new HttpsError("failed-precondition", "That invite has expired — ask for a new one.");
  }

  const orgId: string = invite.orgId;
  const role: string = invite.role || "Viewer";

  // Add the caller to the org's members map (the membership the rules check).
  await db.doc(`organizations/${orgId}`).set({ members: { [uid]: role } }, { merge: true });
  // Link their account: switch to this org, set the invited role, and record
  // membership in orgIds so the org-switcher can list every org they belong to.
  await db.doc(`users/${uid}`).set(
    { currentOrgId: orgId, role, orgIds: FieldValue.arrayUnion(orgId) },
    { merge: true },
  );
  // Burn the code.
  await inviteRef.set(
    { used: true, usedByUid: uid, usedAt: new Date().toISOString() },
    { merge: true },
  );

  return { orgId, role, orgName: invite.orgName || "" };
});
