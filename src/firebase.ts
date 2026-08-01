import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  getDocFromServer,
  addDoc,
  runTransaction,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

const app = initializeApp(firebaseConfig);

export const db = initializeFirestore(
  app,
  {
    ignoreUndefinedProperties: true,
    // Persist the cache to IndexedDB so a reload paints instantly from local
    // data and syncs in the background, instead of blocking on the network.
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
    // Auto-detect the fastest transport: use WebSocket streaming when the
    // network allows (low latency) and only fall back to long-polling when a
    // proxy actually requires it. Forcing long-polling made every connection
    // — and the first write/read after a reload — noticeably slower.
    experimentalAutoDetectLongPolling: true,
  },
  firebaseConfig.firestoreDatabaseId,
);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  getDocFromServer,
  signInWithPopup,
  signOut,
  addDoc,
  runTransaction,
  getDocs,
  writeBatch,
};

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName:
            provider.displayName || auth.currentUser?.displayName || null,
          email: provider.email || auth.currentUser?.email || null,
          photoUrl: provider.photoURL || auth.currentUser?.photoURL || null,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Connection test removed
