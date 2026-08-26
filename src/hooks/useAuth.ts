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

    const unsubscribeAuth = auth.onAuthStateChanged(async (firebaseUser) => {
      if (unsubscribeUser) {
        unsubscribeUser();
        unsubscribeUser = undefined;
      }

      if (firebaseUser) {
        try {
          unsubscribeUser = onSnapshot(
            doc(db, "users", firebaseUser.uid),
            async (userDoc) => {
              if (userDoc.exists()) {
                const data = userDoc.data() as UserProfile;
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
                // Auto-upgrade specific email to Admin for testing
                if (
                  firebaseUser.email === "gowtham.jaihind@gmail.com" &&
                  data.role !== "Admin" &&
                  data.role !== "Owner"
                ) {
                  const updatedProfile = { ...data, role: "Owner" as const };
                  await updateDoc(doc(db, "users", firebaseUser.uid), {
                    role: "Owner",
                  });
                  setUser({ uid: firebaseUser.uid, ...updatedProfile });
                } else {
                  setUser({ uid: firebaseUser.uid, ...data });
                }
                setLoading(false);
              } else {
                // Create default profile
                const idTokenResult = await firebaseUser.getIdTokenResult();
                const isAdminFallback =
                  idTokenResult.claims?.role === "Admin" ||
                  idTokenResult.claims?.admin === true ||
                  firebaseUser.email === "gowtham.jaihind@gmail.com";

                // First sign-in only happens after the consent gate, so record
                // acceptance on the profile (fall back to the current version).
                const consent =
                  readPendingConsent() || { termsVersion: TERMS_VERSION, acceptedAt: new Date().toISOString() };
                const newProfile: UserProfile = {
                  uid: firebaseUser.uid,
                  email: firebaseUser.email || "",
                  displayName: firebaseUser.displayName || "User",
                  role: firebaseUser.email === "gowtham.jaihind@gmail.com" ? "Owner" : (isAdminFallback ? "Admin" : "Viewer"),
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
