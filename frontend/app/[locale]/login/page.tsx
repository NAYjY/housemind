"use client";

/**
 * app/login/page.tsx — HouseMind
 *
 * SEC-23 fix: role selector removed.
 *   Previously a four-option role picker was rendered but the selected value
 *   was never sent to the backend.  The backend returns the role stored in the
 *   database, so the picker was pure UI fiction that misled users about what
 *   they were signing in as.
 *
 * SEC-13 fix: uses storeSession() instead of setToken().
 *   The JWT itself is now in an httpOnly cookie set by the backend.
 *   We only store non-secret fields (role, user_id) in localStorage for UI.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { storeSession, setLocale } from "@/lib/auth";

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin() {
    if (!email.trim() || !password) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",  // receive the httpOnly cookie
        body: JSON.stringify({ email: email.trim(), password }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? `Server error ${res.status}`);
      }

      const data = await res.json();

      // SEC-13: store only non-secret fields in localStorage
      storeSession({
        access_token: data.access_token,
        role: data.role,
        user_id: data.user_id,
      });

      // Set locale (Thai default for Thai audience)
      setLocale("th");

      router.push(
        "/th/workspace/00000002-0000-0000-0000-000000000001/00000003-0000-0000-0000-000000000001"
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-header">
          <div className="login-wordmark">
            House<span>Mind</span>
          </div>
          <div className="login-sub">Visual decisions workspace</div>
        </div>

        <div className="login-body">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleLogin();
            }}
          >
            <div className="login-label">Email</div>
            <input
              className="login-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />

            <div className="login-label">Password</div>
            <input
              className="login-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />

            {error && <div className="login-error">{error}</div>}

            <button
              className="login-submit"
              type="submit"
              disabled={loading}
              style={{ marginTop: 8 }}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div
            style={{
              marginTop: 16,
              textAlign: "center",
              fontSize: 12,
              color: "var(--stone-500)",
            }}
          >
            Don&apos;t have an account?{" "}
            <a
              href="/th/auth/register"
              style={{ color: "var(--color-accent)" }}
            >
              Register
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
