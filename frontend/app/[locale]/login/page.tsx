"use client";

/**
 * app/[locale]/login/page.tsx — HouseMind
 * SEC-23: role selector removed.
 * SEC-13: uses storeSession() — JWT in httpOnly cookie, only non-secret fields in localStorage.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { storeSession, setLocale } from "@/lib/auth";
import styles from "./Login.module.css";

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export default function LoginPage() {
  const router = useRouter();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  async function handleLogin() {
    if (!email.trim() || !password) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? `Server error ${res.status}`);
      }
      const data = await res.json();
      storeSession({ access_token: data.access_token, role: data.role, user_id: data.user_id });
      setLocale("th");
      router.push("/th/profile");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.loginWrap}>
      <div className={styles.loginCard}>
        <div className={styles.loginHeader}>
          <div className={styles.loginWordmark}>House<span>Mind</span></div>
          <div className={styles.loginSub}>Visual decisions workspace</div>
        </div>

        <div className={styles.loginBody}>
          <form onSubmit={(e) => { e.preventDefault(); handleLogin(); }}>
            <div className={styles.loginLabel}>Email</div>
            <input
              className={styles.loginInput}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />

            <div className={styles.loginLabel}>Password</div>
            <input
              className={styles.loginInput}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />

            {error && <div className={styles.loginError}>{error}</div>}

            <button
              className={styles.loginSubmit}
              type="submit"
              disabled={loading}
              style={{ marginTop: 8 }}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div style={{ marginTop: 16, textAlign: "center", fontSize: 12, color: "var(--stone-500)" }}>
            Don&apos;t have an account?{" "}
            <a href="/th/auth/register" style={{ color: "var(--color-accent)" }}>
              Register
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}