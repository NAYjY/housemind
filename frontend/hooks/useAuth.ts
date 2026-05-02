"use client";

/**
 * hooks/useAuth.ts — HouseMind
 *
 * SEC-13: authentication state is now derived from localStorage role/user_id
 * (non-secret fields stored by storeSession after login).
 * The JWT itself lives in an httpOnly cookie and is never accessed by JS.
 */

import { useState, useEffect } from "react";
import {
  getCurrentUser,
  canWrite,
  canResolve,
  isReadOnly,
  logout as performLogout,
  type TokenPayload,
} from "@/lib/auth";

export interface AuthState {
  user: TokenPayload | null;
  isAuthenticated: boolean;
  canWrite: boolean;
  canResolve: boolean;
  isReadOnly: boolean;
  role: string | undefined;
  logout: () => Promise<void>;
}

function buildState(
  user: TokenPayload | null,
  logoutFn: () => Promise<void>
): AuthState {
  return {
    user,
    isAuthenticated: user !== null,
    canWrite: canWrite(user?.role),
    canResolve: canResolve(user?.role),
    isReadOnly: isReadOnly(user?.role),
    role: user?.role,
    logout: logoutFn,
  };
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>(() =>
    {
     if (typeof window !== "undefined") return buildState(getCurrentUser(), async () => {});
     return buildState(null, async () => {});
   }
  );

  useEffect(() => {
    const user = getCurrentUser();

    const handleLogout = async () => {
      await performLogout();
      setState(buildState(null, handleLogout));
      window.location.href = "/login";
    };

    setState(buildState(user, handleLogout));
  }, []);

  return state;
}
