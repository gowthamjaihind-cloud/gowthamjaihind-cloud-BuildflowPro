/**
 * Who may do what through the command chat (app "Do it for me" and the
 * Telegram/WhatsApp bot). One table, checked on the server before a preview
 * is shown and again when Confirm is pressed.
 *
 * It mirrors firestore.rules, which guards the same data when the app writes
 * it directly:
 *   - a person's role is their profile role (users/{uid}.role), as the rules'
 *     hasAnyRole() reads it, falling back to their role in the org;
 *   - reading a project: Owner/Admin, project access "read"/"write", or the
 *     project's owner; writing: Owner/Admin, access "write", or the owner,
 *     and never while the project is read-only (billingLocked).
 * On top of that, purchasing and money are limited to managers even where
 * the rules would let any writer through: a site engineer can log work and
 * ask about stock, but not raise a PO or record a client payment.
 *
 * Pure, so it is unit-tested.
 */

export type Action =
  | "po.create"
  | "po.approve"
  | "bill.post"
  | "payment.create"
  | "vendorpay.create"
  | "vendor.create"
  | "material.create"
  | "log.create"
  | "ask.site"
  | "ask.money";

export const MANAGER_ROLES = ["Owner", "Admin", "Project Manager", "Project Director"];

export interface Who {
  uid: string;
  role: string; // profile role, else org role
  isMember: boolean;
  projectAccess?: string; // "read" | "write" | "none" for this project
  ownsProject?: boolean;
  projectLocked?: boolean;
}

const POLICY: Record<Action, { need: "read" | "write"; roles: string[] | "any"; what: string }> = {
  "po.create": { need: "write", roles: MANAGER_ROLES, what: "create purchase orders" },
  // As in the app (PurchaseOrderDetails.tsx): only an Owner or Admin approves.
  "po.approve": { need: "write", roles: ["Owner", "Admin"], what: "approve purchase orders" },
  // Posting a bill records the goods receipt (rules: managers and site engineers) and the vendor payable.
  "bill.post": { need: "write", roles: [...MANAGER_ROLES, "Site Engineer"], what: "post bills and goods receipts" },
  "payment.create": { need: "write", roles: MANAGER_ROLES, what: "record client payments" },
  "vendorpay.create": { need: "write", roles: MANAGER_ROLES, what: "record payments to vendors" },
  "vendor.create": { need: "write", roles: MANAGER_ROLES, what: "add vendors" },
  "material.create": { need: "write", roles: MANAGER_ROLES, what: "add materials" },
  "log.create": { need: "write", roles: [...MANAGER_ROLES, "Site Engineer"], what: "log daily work" },
  "ask.site": { need: "read", roles: "any", what: "see this project" },
  "ask.money": { need: "read", roles: MANAGER_ROLES, what: "see this project's money figures" },
};

export function canReadProject(w: Who): boolean {
  return w.isMember && (["Admin", "Owner"].includes(w.role) || ["read", "write"].includes(w.projectAccess || "") || !!w.ownsProject);
}
export function canWriteProject(w: Who): boolean {
  return w.isMember && !w.projectLocked && (["Admin", "Owner"].includes(w.role) || w.projectAccess === "write" || !!w.ownsProject);
}

/** null when allowed, else the reason to show the person. */
export function denial(action: Action, w: Who): string | null {
  const p = POLICY[action];
  if (!w.isMember) return "You are not a member of this workspace.";
  if (p.need === "write" && w.projectLocked) return "This project is read-only until its subscription is renewed.";
  if (p.need === "read" ? !canReadProject(w) : !canWriteProject(w)) {
    return p.need === "read" ? "You don't have access to this project." : "You can view this project but not change it. Ask an Owner or Admin for edit access.";
  }
  if (p.roles !== "any" && !p.roles.includes(w.role)) {
    return `Your role (${w.role || "member"}) cannot ${p.what}. Ask ${p.roles.length <= 2 ? "an Owner or Admin" : "an Owner, Admin or Project Manager"}.`;
  }
  return null;
}

/** What this person may ask for here, for the help text and the model. */
export function allowedActions(w: Who): Action[] {
  return (Object.keys(POLICY) as Action[]).filter((a) => denial(a, w) === null);
}
