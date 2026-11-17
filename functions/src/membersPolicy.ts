/**
 * Who may change whose role in an organization. Pure, so it is unit-tested.
 *
 *  - only an Owner or Admin of the organization changes anything;
 *  - nobody changes their own role (no self-promotion, and no Owner leaving
 *    an organization ownerless by demoting themselves);
 *  - only an Owner makes someone an Owner, or changes an Owner's or an
 *    Admin's role: an Admin cannot remove the Owner or another Admin;
 *  - the member must already belong to the organization (joining is by invite).
 */

export const ASSIGNABLE_ROLES = ["Owner", "Admin", "Project Director", "Project Manager", "Site Engineer", "Viewer", "Stakeholder"];

export function memberChangeDenial(o: {
  members: Record<string, string>;
  caller: string;
  member: string;
  role?: string;
}): string | null {
  const callerRole = o.members[o.caller];
  if (callerRole !== "Owner" && callerRole !== "Admin") return "Only an Owner or Admin can change members' roles and access.";
  const current = o.members[o.member];
  if (!current) return "That person is not a member of this organization.";
  if (o.role === undefined || o.role === current) return null; // project access only
  if (o.member === o.caller) return "You cannot change your own role. Ask another Owner.";
  const touchesTop = o.role === "Owner" || current === "Owner" || o.role === "Admin" || current === "Admin";
  if (touchesTop && callerRole !== "Owner") return "Only an Owner can make someone an Owner or Admin, or change an Owner's or Admin's role.";
  return null;
}
