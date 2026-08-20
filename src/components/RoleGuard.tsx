import React from "react";
import { UserRole } from "../types";
import { useAuthStore } from "../store";

interface RoleGuardProps {
  allowedRoles?: UserRole[];
  projectId?: string;
  requireWriteAccess?: boolean;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RoleGuard({
  allowedRoles,
  projectId,
  requireWriteAccess,
  children,
  fallback = null,
}: RoleGuardProps) {
  const user = useAuthStore((state) => state.user);

  if (!user) return <>{fallback}</>;

  // Owners and Admins have universal access.
  if (user.role === "Admin" || user.role === "Owner") return <>{children}</>;

  // Project-specific role overrides global role if set
  if (projectId && user.projectAccess && user.projectAccess[projectId]) {
    const access = user.projectAccess[projectId];
    if (access === "none") return <>{fallback}</>;

    if (requireWriteAccess) {
      if (access === "write") return <>{children}</>;
      if (access === "read") return <>{fallback}</>; // Explicitly read-only overrides a Project Manager global role giving write
    } else {
      if (access === "read" || access === "write") return <>{children}</>;
    }
  }

  if (allowedRoles && allowedRoles.includes(user.role)) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
}
