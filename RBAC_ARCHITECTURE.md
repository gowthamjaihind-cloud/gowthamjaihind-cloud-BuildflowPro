# Role-Based Access Control (RBAC) Architecture

This document describes the role architecture, permissions model, and implementation guidelines for the application's RBAC system. 

## 1. Authentication & Identity
Authentication is handled via Firebase Authentication. A user successfully logging in is assigned a Firebase UID.

## 2. Role Architecture (Storage)
Roles are assigned and enforced using a multi-tiered approach to ensure tight security:

### Tier 1: Firebase Custom Claims (Highest Priority, Recommended)
*   **Storage**: Inside the Firebase Auth Token itself.
*   **Management**: Assigned via a secure backend (e.g., Firebase Admin SDK in Cloud Functions).
*   **Properties**: `admin: true` or `role: "Admin"`.
*   **Benefit**: Fastest to verify in security rules, no document read cost.

### Tier 2: `roles` Collection (Secondary / Secure Data Plane)
*   **Storage**: `/roles/{uid}`.
*   **Properties**: `{ role: "Admin" | "Project Manager" | "Site Engineer" | "Viewer" }`.
*   **Benefit**: Fully decoupled from public user profiles. Only administrators can write to this collection.

### Tier 3: `users` Collection (Tertiary / Application Plane)
*   **Storage**: `/users/{uid}`.
*   **Properties**: `{ role: "Admin" | "Project Manager" | ... }` .
*   **Benefit**: Readily available to the frontend without requiring multiple document fetches.

> *Note: Rules automatically check across Custom Claims, `roles` collection, and `users` collection to gracefully fall back depending on your current Firebase environment setup.*

## 3. Permissions Model

The application uses an Attribute-Based Access Control (ABAC) mixed with Role-Based Access Control (RBAC) model. 

### Roles & Access Levels

| Role | Application Privilege | Security Rule Enforcement |
| :--- | :--- | :--- |
| **Admin** | Full system access. | Can read, write, and delete any resource (`projects`, `users`, `ledger`, `roles`, etc.). Evaluated via `isAdmin()` helper. |
| **Project Manager** | Scoped management access. | Can update the `status` and details of projects they are assigned to (or are `ownerId` of). Can manage `costs` and project `tasks`. Evaluated via `isProjectManager()` helper. |
| **Site Engineer** | Operational access. | Can interact with daily logs, `tasks`, `material_issues`, and `documents` but has restricted control over financial endpoints unelss permitted via task assignment. |
| **Stakeholder** | Read-heavy access. | Can view `reports`, `status`, and `tasks` but cannot modify them. |
| **Viewer** | Default Read-Only | Restricted access; primarily granted read permissions after project assignments. |

## 4. Firestore Security Rules Helpers

The `firestore.rules` leverages a unified sequence in its master gate:

```javascript
// Validates whether the Firebase Token has admin claims, or if their Role falls back to 'Admin'
function isAdmin() {
  return isAuthenticated() && (
    request.auth.token.admin == true ||
    request.auth.token.role == 'Admin' ||
    (exists(/databases/$(database)/documents/roles/$(request.auth.uid)) && 
     get(/databases/$(database)/documents/roles/$(request.auth.uid)).data.role == 'Admin') ||
    (exists(/databases/$(database)/documents/users/$(request.auth.uid)) && 
     get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'Admin')
  );
}
```

## 5. Security Practices & Future Steps

1.  **Remove Client Auto-Escalation**: Previously, specific email addresses automatically received elevated rights client-side. This anti-pattern was removed.
2.  **Implementing Custom Claims Provisioning**: Deploy a Cloud Function `onUserCreated` (or an HTTP admin endpoint) that provisions the token claims based on corporate directories to ensure zero client-side tampering.
3.  **Roles Collection Immutability**: Ensure nothing other than an `Admin` can modify the `/roles/{uid}` documents.
