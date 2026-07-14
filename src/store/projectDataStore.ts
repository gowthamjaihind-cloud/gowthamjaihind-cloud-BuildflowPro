import { useAuthStore } from "./authStore";
import { create } from "zustand";
import {
  db,
  collection,
  getDocs,
  query,
  orderBy,
  handleFirestoreError,
  OperationType,
} from "../firebase";
import {
  InventoryItem,
  Vendor,
  CostEntry,
  LaborRateCard,
  VendorLedgerEntry,
  MaterialReceipt,
  DailyLaborLog,
  RABill,
  MaterialIssue,
  ProjectDocument,
} from "../types";
import { getProjectSubCollectionPath } from "../utils/projectPath";

interface CacheKey {
  projectId: string;
  type: string;
}

interface ProjectDataState {
  cache: Record<string, any[]>;
  loading: Record<string, boolean>;

  fetchCollection: (
    projectId: string,
    type:
      | "inventory"
      | "suppliers"
      | "costs"
      | "labor_rate_cards"
      | "ledger"
      | "receipts"
      | "labor_logs"
      | "ra_bills"
      | "material_issues"
      | "documents"
      | "daily_site_reports"
      | "client_payments",
    orderByField?: string,
    orderDirection?: "asc" | "desc",
    forceRefresh?: boolean,
  ) => Promise<any[]>;
  refreshCollection: (
    projectId: string,
    type:
      | "inventory"
      | "suppliers"
      | "costs"
      | "labor_rate_cards"
      | "ledger"
      | "receipts"
      | "labor_logs"
      | "ra_bills"
      | "material_issues"
      | "documents"
      | "daily_site_reports"
      | "client_payments",
    orderByField?: string,
    orderDirection?: "asc" | "desc",
  ) => Promise<any[]>;
  invalidate: (projectId: string, type: string) => void;
  invalidateAll: (projectId: string) => void;
  updateCacheObj: (
    projectId: string,
    type: string,
    action: "add" | "update" | "delete",
    obj: any,
  ) => void;
}

const getCacheKeyString = (projectId: string, type: string) =>
  `${projectId}_${type}`;

export const useProjectDataStore = create<ProjectDataState>((set, get) => ({
  cache: {},
  loading: {},

  fetchCollection: async (
    projectId,
    type,
    orderByField,
    orderDirection = "desc",
    forceRefresh = false,
  ) => {
    const key = getCacheKeyString(projectId, type);

    // Return cached if available and not forcing refresh
    if (!forceRefresh && get().cache[key]) {
      return get().cache[key];
    }

    if (get().loading[key]) {
      // If already loading, we could wait, but for simplicity we can just return existing cache or empty array
      return get().cache[key] || [];
    }

    set((state) => ({ loading: { ...state.loading, [key]: true } }));

    try {
      const path = getProjectSubCollectionPath(projectId, type);
      let q = query(collection(db, path));
      if (orderByField) {
        q = query(collection(db, path), orderBy(orderByField, orderDirection));
      }

      const snapshot = await getDocs(q);
      const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

      set((state) => ({
        cache: { ...state.cache, [key]: data },
        loading: { ...state.loading, [key]: false },
      }));

      return data;
    } catch (error) {
      set((state) => ({ loading: { ...state.loading, [key]: false } }));
      const path = getProjectSubCollectionPath(projectId, type);
      handleFirestoreError(
        error,
        OperationType.LIST,
        path,
      );
      return [];
    }
  },

  refreshCollection: async (
    projectId: string,
    type:
      | "inventory"
      | "suppliers"
      | "costs"
      | "labor_rate_cards"
      | "ledger"
      | "receipts"
      | "labor_logs"
      | "ra_bills"
      | "material_issues"
      | "documents"
      | "daily_site_reports"
      | "client_payments",
    orderByField?: string,
    orderDirection?: "asc" | "desc",
  ) => {
    return get().fetchCollection(
      projectId,
      type,
      orderByField,
      orderDirection,
      true,
    );
  },

  invalidate: (projectId, type) => {
    const key = getCacheKeyString(projectId, type);
    set((state) => {
      const newCache = { ...state.cache };
      delete newCache[key];
      return { cache: newCache };
    });
  },

  invalidateAll: (projectId) => {
    set((state) => {
      const newCache = { ...state.cache };
      Object.keys(newCache).forEach((k) => {
        if (k.startsWith(`${projectId}_`)) {
          delete newCache[k];
        }
      });
      return { cache: newCache };
    });
  },

  updateCacheObj: (projectId, type, action, obj) => {
    const key = getCacheKeyString(projectId, type);
    set((state) => {
      const currentCache = state.cache[key] || [];
      let newCacheData = [...currentCache];

      if (action === "add") {
        // Prevent duplicate adds if already there
        if (!newCacheData.find((item) => item.id === obj.id)) {
          newCacheData = [obj, ...currentCache];
        }
      } else if (action === "update") {
        newCacheData = newCacheData.map((item) =>
          item.id === obj.id ? { ...item, ...obj } : item,
        );
      } else if (action === "delete") {
        newCacheData = newCacheData.filter((item) => item.id !== obj.id);
      }

      return {
        cache: {
          ...state.cache,
          [key]: newCacheData,
        },
      };
    });
  },
}));
