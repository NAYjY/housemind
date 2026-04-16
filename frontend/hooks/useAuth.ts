"use client";

/**
 * hooks/useAuth.ts — HouseMind
 * Reads current user from JWT and exposes role-gating helpers.
 * Used by components to show/hide resolve button, delete controls, etc.
 */

import { useMemo } from "react";
import { getCurrentUser, canWrite, canResolve, isReadOnly, type TokenPayload } from "@/lib/auth";

export interface AuthState {
  user: TokenPayload | null;
  isAuthenticated: boolean;
  canWrite: boolean;       // architect only
  canResolve: boolean;     // architect + contractor
  isReadOnly: boolean;     // homeowner + supplier
  role: string | undefined;
}

export function useAuth(): AuthState {
  // Computed once per render; token changes trigger a full page reload anyway
  return useMemo(() => {
    const user = getCurrentUser();
    return {
      user,
      isAuthenticated: user !== null,
      canWrite: canWrite(user?.role),
      canResolve: canResolve(user?.role),
      isReadOnly: isReadOnly(user?.role),
      role: user?.role,
    };
  }, []);
}
