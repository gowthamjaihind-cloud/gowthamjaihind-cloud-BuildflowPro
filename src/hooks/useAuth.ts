import { useEffect } from "react";
import {
  auth,
  db,
  doc,
  onSnapshot,
  updateDoc,
  setDoc,
  handleFirestoreError,
  OperationType,
} from "../firebase";
import { UserProfile } from "../types";
import { useAuthStore } from "../store";
import { readPendingConsent, clearPendingConsent, TERMS_VERSION } from "../lib/legal";
import { demoRequested } from "../demo";
import { callSyncMyClaims } from "../services/firebaseFunctions";

/**
 * Make sure the ID token this browser holds carries the org-membership claim.
 *
 * Storage rules can only see tenancy through that claim. It is minted on the
 * server, but a token already issued does not change: it has to be refreshed.
 * The old code refreshed only when the sync reported `changed`, and ran only
 * at sign-in. A new customer signs in FIRST and creates their company second;
 * by then a trigger had already minted the claim, so the sync said "unchanged"
 * and the stale token stayed -- every upload (documents, site photos) was
 * refused for up to an hour, with an error blaming our configuration.
 *
 * So: compare what the server says against what the token actually holds, and
 * refresh on any gap. Retries briefly, because the trigger that mints the claim
 * for a brand-new org may not have finished yet. Never fatal.
 */
async function ensureOrgClaim(firebaseUser: { getIdToken: (force?: boolean) => Promise<string>; getIdTokenResult: () => Promise<{ claims: Record<string, unknown> }> }, wantOrg?: string) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const { orgIds = [], changed } = await callSyncMyClaims();
      const held = (await firebaseUser.getIdTokenResult()).claims.orgIds;
      const heldIds = Array.isArray(held) ? (held as string[]) : [];
      const missing = orgIds.some((id) => !heldIds.includes(id));
      if (changed || missing) await firebaseUser.getIdToken(true);
      if (!wantOrg || orgIds.includes(wantOrg)) return;
    } catch (e) {
      console.warn("claim sync skipped", e);
    }
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
}


export function useAuthInit() {
  const setUser = useAuthStore((state) => state.setUser);
  const setLoading = useAuthStore((state) => state.setLoading);

  useEffect(() => {
    if (__DEMO__ && demoRequested()) {
      // Written inline rather than imported: with __DEMO__ folded to false the
      // minifier deletes this block outright, so nothing here can reach a
      // production bundle. An import would survive as a live binding.
      setUser({
        uid: "demo-user",
        email: "demo@sitetru.com",
        displayName: "Demo Owner",
        role: "Owner",
        currentOrgId: "demo-org",
        orgIds: ["demo-org"],
        legal: { termsVersion: "2026-08-25", acceptedAt: "2026-08-26T00:00:00.000Z" },
      } as any);
      setLoading(false);
      return;
    }

    let unsubscribeUser: (() => void) | undefined;
    let lastClaimOrg: string | undefined;

    const unsubscribeAuth = auth.onAuthStateChanged(async (firebaseUser) => {
      if (unsubscribeUser) {
        unsubscribeUser();
        unsubscribeUser = undefined;
      }

      if (firebaseUser) {
        // Storage rules can only see tenancy through a custom claim, so make
        // sure this account has one before anything tries to read a file. A
        // fresh claim is not in the token we already hold, hence the forced
        // refresh. Never fatal: failing here must not block sign-in, it just
        // means uploads stay denied until the next attempt.
        void ensureOrgClaim(firebaseUser);

        try {
          unsubscribeUser = onSnapshot(
            doc(db, "users", firebaseUser.uid),
            async (userDoc) => {
              if (userDoc.exists()) {
                const data = userDoc.data() as UserProfile;
                // Creating or joining a company happens AFTER sign-in, so the
                // sign-in sync above ran too early to help. Re-check whenever
                // the active company changes.
                if (data.currentOrgId && data.currentOrgId !== lastClaimOrg) {
                  lastClaimOrg = data.currentOrgId;
                  void ensureOrgClaim(firebaseUser, data.currentOrgId);
                }
                // Record consent captured at the sign-in gate, if we haven't
                // stored it yet or it predates the current Terms version.
                const pendingConsent = readPendingConsent();
                if (
                  pendingConsent &&
                  data.legal?.termsVersion !== pendingConsent.termsVersion
                ) {
                  await updateDoc(doc(db, "users", firebaseUser.uid), {
                    legal: pendingConsent,
                  });
                  data.legal = pendingConsent;
                  clearPendingConsent();
                }
                // Roles come from the org (createOrganization, invites, or an
                // admin of the same org) -- firestore.rules refuses a user
                // writing their own. There used to be an email-based
                // self-promotion to Owner here; the rules now deny it.
                // Backfill anything the stored doc is missing rather than
                // spreading it blind: a profile written by an older build (or
                // a partial write) otherwise yields a user with no email,
                // which the post-sign-up screen renders as "Signed in as .".
                setUser({
                  uid: firebaseUser.uid,
                  ...data,
                  email: data.email || firebaseUser.email || "",
                  displayName: data.displayName || firebaseUser.displayName || "User",
                  role: data.role || "Viewer",
                });
                setLoading(false);
              } else {
                // Create default profile
                const idTokenResult = await firebaseUser.getIdTokenResult();
                // A new profile is a Viewer unless a verified custom claim says
                // otherwise -- the only other role firestore.rules accepts here.
                const claimedAdmin = idTokenResult.claims?.role === "Admin";

                // First sign-in only happens after the consent gate, so record
                // acceptance on the profile (fall back to the current version).
                const consent =
                  readPendingConsent() || { termsVersion: TERMS_VERSION, acceptedAt: new Date().toISOString() };
                const newProfile: UserProfile = {
                  uid: firebaseUser.uid,
                  email: firebaseUser.email || "",
                  displayName: firebaseUser.displayName || "User",
                  role: claimedAdmin ? "Admin" : "Viewer",
                  photoURL: firebaseUser.photoURL || undefined,
                  legal: consent,
                };
                await setDoc(doc(db, "users", firebaseUser.uid), newProfile);
                clearPendingConsent();
                setUser(newProfile);
                setLoading(false);
              }
            },
            (error) => {
              setLoading(false);
              handleFirestoreError(
                error,
                OperationType.GET,
                `users/${firebaseUser.uid}`,
              );
            },
          );
        } catch (error) {
          setLoading(false);
          handleFirestoreError(
            error,
            OperationType.GET,
            `users/${firebaseUser.uid}`,
          );
        }
      } else {
        setUser(null);
        setLoading(false);
        if (unsubscribeUser) {
          unsubscribeUser();
          unsubscribeUser = undefined;
        }
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUser) {
        unsubscribeUser();
      }
    };
  }, [setUser, setLoading]);
}
