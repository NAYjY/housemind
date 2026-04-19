"use client";

import { useState, useEffect } from "react";
import { getCurrentUser, canWrite, canResolve, isReadOnly, type TokenPayload } from "@/lib/auth";

export interface AuthState {
  user: TokenPayload | null;
  isAuthenticated: boolean;
  canWrite: boolean;
  canResolve: boolean;
  isReadOnly: boolean;
  role: string | undefined;
}

function buildState(user: TokenPayload | null): AuthState {
  return {
    user,
    isAuthenticated: user !== null,
    canWrite: canWrite(user?.role),
    canResolve: canResolve(user?.role),
    isReadOnly: isReadOnly(user?.role),
    role: user?.role,
  };
}

export function useAuth(): AuthState {
  // Start with empty state (safe for SSR — no localStorage access)
  const [state, setState] = useState<AuthState>(buildState(null));

  useEffect(() => {
    // Runs only on the client after hydration — localStorage is available here
    setState(buildState(getCurrentUser()));
  }, []);

  return state;
}