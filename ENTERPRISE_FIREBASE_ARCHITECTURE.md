# Enterprise Firebase Architecture for Multi-Tenant SaaS

## 1. Weakness Analysis of Current (Root-Level) Patterns

Currently, your application queries and stores data at the root level (e.g., `/projects/{projectId}`, `/users/{userId}`). 
For a production SaaS, this introduces critical vulnerabilities and scalability constraints:

1. **The Cross-Tenant Leakage (Data Spillage):** At the root level, ensuring isolation requires every query to explicitly filter by `orgId` or `userId`. If a developer forgets a `where("orgId", "==", orgId)` clause, and the security rules rely on `isSignedIn()`, data bleeds across organizations.
2. **Denial of Wallet (O(n) Read Attacks):** If you try to secure root-level `list` queries by checking a subcollection inside the rule (e.g., `get(/databases/.../projects/$(resource.id)/members/$(request.auth.uid))`), an attacker can force your database to execute thousands of background `get()` reads by repeatedly executing `getDocs(collection(db, "projects"))`. Firebase charges for every `get()` evaluated in a rule.
3. **Orphaned Access (The "Ghost Employee" Problem):** When an employee leaves, removing them from a root-level `users` collection doesn't synchronously remove them from the 50 projects they were assigned to unless you write cascading cloud functions.

## 2. Multi-Tenant Scalable Schema (The "Org-Root" pattern)

To enforce strict structural boundaries, move the boundary to the path itself.

```text
/organizations/{orgId}
  /members/{userId}                   <- The Source of Truth for RBAC
    - role: "PROJECT_MANAGER"
    - projectIds: ["proj_1", "proj_2"] // For fine-grained limits
  /projects/{projectId}               <- All project data inherently belongs to org
    - orgId: {orgId}                  <- Mirrored for redundant security guarantees
    /tasks/{taskId}
    /financials/{financeId}           <- Strictly isolated sub-collection
    /procurement/{poId}
```

## 3. RBAC (Role-Based Access Control) Strategy

Roles: `SUPER_ADMIN`, `ORG_ADMIN`, `PROJECT_DIRECTOR`, `PROJECT_MANAGER`, `SITE_ENGINEER`, `PROCUREMENT_OFFICER`, `FINANCE`, `CLIENT`, `VENDOR`.

**The Custom Claims + DB Guard Pattern:**
To solve the "Denial of Wallet" problem, you use Firebase Auth Custom Claims for list query gating, combined with DB lookups for high-stakes mutations.
1. When a user is added to `/organizations/{orgId}/members/{userId}`, a Cloud Function synchronously applies `{ currentOrgId: orgId, role: "FINANCE" }` to their Auth Token.
2. The UI uses the token to render safely without extra DB calls.
3. Firestore rules enforce `request.auth.token.currentOrgId == orgId` instantly (Zero DB cost).

## 4. Frontend Integration Examples

### Secure Query Pattern (React/TypeScript)
Always query specifically within the tenant boundary.

```tsx
import { collection, query, where, getDocs } from "firebase/firestore";

// ✅ SECURE: The rule will allow this because the path enforces the orgId.
export const fetchProjectFinancials = async (orgId: string, projectId: string) => {
  const path = `organizations/${orgId}/projects/${projectId}/financials`;
  const q = query(collection(db, path), where("status", "==", "APPROVED"));
  return await getDocs(q);
};

// ❌ INSECURE: A root collection group query risks reading across orgs if not strictly bounded.
// const q = query(collectionGroup("financials")); 
```

### Firestore Transaction Usage (Atomic Workflows)
For operations like approving a procurement request and deducting from a project budget:

```tsx
import { doc, runTransaction } from "firebase/firestore";

export const approveProcurementPO = async (orgId: string, projectId: string, poId: string) => {
  const poRef = doc(db, `organizations/${orgId}/projects/${projectId}/procurement/${poId}`);
  const budgetRef = doc(db, `organizations/${orgId}/projects/${projectId}/financials/budget`);

  try {
    await runTransaction(db, async (transaction) => {
      const poDoc = await transaction.get(poRef);
      if (!poDoc.exists) throw new Error("Document does not exist!");
      if (poDoc.data().status !== "PENDING") throw new Error("PO already processed.");

      const budgetDoc = await transaction.get(budgetRef);
      const newBalance = budgetDoc.data().remaining - poDoc.data().totalAmount;
      if (newBalance < 0) throw new Error("Insufficient funds.");

      // Commit atomically
      transaction.update(poRef, { status: "APPROVED", updatedBy: auth.currentUser.uid });
      transaction.update(budgetRef, { remaining: newBalance });
    });
    console.log("Transaction successfully committed!");
  } catch (e) {
    console.error("Transaction failed: ", e);
  }
}
```

## 5. Secure Callable Patterns (Cloud Functions)

When using the backend for bulk actions or PDF generations, use strict schema validation and auth checking before executing:

```typescript
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

export const executeFinancialAudit = onCall(async (request) => {
  const { orgId, projectId } = request.data;
  const uid = request.auth?.uid;

  if (!uid) throw new HttpsError("unauthenticated", "Auth required.");
  
  // 1. Verify token claims
  if (request.auth?.token.currentOrgId !== orgId) {
    throw new HttpsError("permission-denied", "Cross-tenant access blocked.");
  }
  
  // 2. Verify specific high-clearance role
  const allowedRoles = ["SUPER_ADMIN", "ORG_ADMIN", "FINANCE", "PROJECT_DIRECTOR"];
  if (!allowedRoles.includes(request.auth?.token.role)) {
     throw new HttpsError("permission-denied", "Insufficient privileges for audit.");
  }

  // 3. Perform the secure backend operation...
  return { status: "success", auditHash: "abc..." };
});
```
