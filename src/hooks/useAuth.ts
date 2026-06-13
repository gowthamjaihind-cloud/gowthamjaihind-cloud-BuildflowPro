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

export function useAuthInit() {
  const setUser = useAuthStore((state) => state.setUser);
  const setLoading = useAuthStore((state) => state.setLoading);

  useEffect(() => {
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
                // Auto-upgrade specific email to Admin for testing
                if (
                  firebaseUser.email === "gowtham.jaihind@gmail.com" &&
                  data.role !== "Admin"
                ) {
                  const updatedProfile = { ...data, role: "Admin" as const };
                  await updateDoc(doc(db, "users", firebaseUser.uid), {
                    role: "Admin",
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

                const newProfile: UserProfile = {
                  uid: firebaseUser.uid,
                  email: firebaseUser.email || "",
                  displayName: firebaseUser.displayName || "User",
                  role: isAdminFallback ? "Admin" : "Viewer",
                  photoURL: firebaseUser.photoURL || undefined,
                };
                await setDoc(doc(db, "users", firebaseUser.uid), newProfile);
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
