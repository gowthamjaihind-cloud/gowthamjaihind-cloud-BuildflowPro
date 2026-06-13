# Firebase Performance & Cost Optimization Strategy

## 1. Cost Implications & The "Read Amplification" Problem

Firestore pricing primarily depends on **document reads**. By default, if a collection has 10,000 documents and you run a `getDocs(collection)` or `onSnapshot(collection)` without query limits, you are billed for 10,000 reads *per user* who mounts that component. 

### Why Current Realtime Usage is Critically Expensive
Based on the codebase analysis, heavily trafficked views like `CostManagement.tsx` and `ReportsView.tsx` are establishing `onSnapshot` listeners to 6-9 collections simultaneously (tasks, inventory, rate cards, ledger, labor logs, material issues, vendors, costs).
- **Initialization Cost:** Loading the `CostManagement` tab for a moderately sized project of 1,000 documents across 9 collections incurs 9,000 reads globally. If 50 users load that tab a day, that is 450,000 reads per day just for one tab.
- **Amplification on Updates:** If one vendor name changes, `onSnapshot` pushes an update.
- **Memory Leaks:** If listeners aren't properly cleaned up on unmount during rapid tab switching, overlapping listeners will multiply billed background reads.

## 2. Identified Bottlenecks

### 2.1 Over-Reliance on Realtime Listeners
Realtime `onSnapshot` is currently used across:
- `CostManagement.tsx`
- `ReportsView.tsx`
- `ProcurementView.tsx`
- `UnifiedEntryView.tsx`
- `InventoryView.tsx`
- `DocumentVault.tsx`

**Verdict**: None of these modules explicitly require millisecond latency. A project manager does not need realtime socket updates when a procurement order is drafted. 

### 2.2 Unpaginated Queries
Many `getDocs` operations execute without an `orderBy` or `limit()` clause. Fetching `projects/{projectId}/tasks` without pagination will eventually freeze the client device and spike Firebase billing as a construction project reaches thousands of tasks over a multi-year period.

### 2.3 Duplicate Queries
Components fetch tasks, inventory, and ledger independently on mount. `ReportsView` fetches data that `ProcurementView` might have already queried.

## 3. The Refactored Architecture (React Query + Firestore)

We will migrate the app to use **React Query (`@tanstack/react-query`)** as the primary data fetching and caching layer, replacing `onSnapshot` in non-realtime views with `getDocs()`.

### React Query Key Strategy
Strictly structure query keys to represent hierarchical dependencies.
```typescript
const queryKeys = {
  // Global domain
  projects: {
    all: ['projects'] as const,
    detail: (orgId: string, projectId: string) => [...queryKeys.projects.all, orgId, projectId] as const,
  },
  // Sub-domains
  procurement: {
    list: (orgId: string, projectId: string, filters?: any) => 
      [...queryKeys.projects.detail(orgId, projectId), 'procurement', filters] as const,
  },
  financials: {
    list: (orgId: string, projectId: string) => 
       [...queryKeys.projects.detail(orgId, projectId), 'financials'] as const,
  }
}
```

### Caching Defaults
- **Stale Time**: Define how long data is considered fresh. `staleTime: 5 * 60 * 1000` (5 minutes) represents a good balance for construction management views.
- **Cache Time**: Define how long inactive data is kept in memory.
- **Refetch Windows**: Disable `refetchOnWindowFocus` for financial data to prevent massive accidental reads when the user alt-tabs back to the browser.

## 4. Pagination & Cursor Patterns

Instead of fetching the entire task tree, use Firestore `startAfter()` combined with React Query's `useInfiniteQuery`.

```typescript
import { query, collection, orderBy, limit, startAfter, getDocs } from "firebase/firestore";

export const fetchProcurementOrders = async (orgId: string, projectId: string, pageParam: any = null) => {
  const path = `organizations/${orgId}/projects/${projectId}/procurement`;
  let q = query(
    collection(db, path),
    orderBy("createdAt", "desc"),
    limit(50)
  );

  if (pageParam) {
    q = query(q, startAfter(pageParam));
  }

  const snapshot = await getDocs(q);
  const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const lastVisible = snapshot.docs[snapshot.docs.length - 1];

  return { data, nextCursor: lastVisible || null };
}
```

## 5. Optimized Component Refactoring Example

**Before (Expensive & Leaky)**
```tsx
useEffect(() => {
  const unsub = onSnapshot(collection(db, "projects/123/ledger"), snapshot => {
    setLedger(snapshot.docs.map(d => d.data()));
  });
  return () => unsub();
}, []);
```

**After (Performant & Cached)**
```tsx
import { useQuery } from '@tanstack/react-query';

const { data: ledger, isLoading } = useQuery({
  queryKey: queryKeys.financials.list(orgId, projectId),
  queryFn: () => fetchFinancialLedger(orgId, projectId),
  staleTime: 5 * 60 * 1000, // Serve from cache for 5 minutes
});

// Mutating Data
const mutation = useMutation({
  mutationFn: addLedgerEntry,
  onSuccess: () => {
    // Invalidate the cache to trigger a targeted background refetch
    queryClient.invalidateQueries(queryKeys.financials.list(orgId, projectId));
  }
})
```

## 6. Realtime Listener Retention

Keep `onSnapshot` **only** for:
1. `chat` channels / messaging modules.
2. Notifications polling (`notifications/{userId}`).
3. Active WebSocket-like presence tracking (e.g. `live_attendance`).

For all views like `CostManagement`, `ProcurementView`, `WBSView`:
- Read once using a staggered `useQuery` / `useQueries`.
- Use local optimistic updates for fast UI interaction.
- Synchronize back to the server using standard DOM events or "Save" buttons.

## 7. Firestore Indexing Recommendations
When enabling pagination (`orderBy` + `where` + `limit`), you must define composite indexes.
Deploy these through `firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "procurement",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "tasks",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "parentId", "order": "ASCENDING" },
        { "fieldPath": "order", "order": "ASCENDING" }
      ]
    }
  ]
}
```
