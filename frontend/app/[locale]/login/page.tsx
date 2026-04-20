"use client";

// app/login/page.tsx — HouseMind dev login
// Uses the dev endpoint to create/fetch a user and store their JWT.
// In production this page still works but the backend will 404 the endpoint.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setToken } from "@/lib/auth";

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

const ROLES = ["architect", "contractor", "homeowner", "supplier"] as const;
type Role = typeof ROLES[number];

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  architect:   "Can create annotations, add items, resolve threads",
  contractor:  "Can resolve and reopen threads, view all",
  homeowner:   "Read-only — can view annotations and products",
  supplier:    "Read-only — can view product details",
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("architect@housemind.com");
  const [role, setRole] = useState<Role>("architect");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");

  async function handleLogin() {
    if (!email.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? `Server error ${res.status}`);
      }

      const data = await res.json();
      setToken(data.access_token);
      // router.push("/workspace/demo/demo-image?src=https://images.unsplash.com/photo-1555041469-a586c61ea9bc&readOnly=false")
      // Redirect to workspace demo or home
      router.push("/th/workspace/00000002-0000-0000-0000-000000000001/00000003-0000-0000-0000-000000000001");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      

      <div className="login-wrap">
        <div className="login-card">
          <div className="login-header">
            <div className="login-wordmark">House<span>Mind</span></div>
            <div className="login-sub">Visual decisions workspace</div>
          </div>

          <div className="login-body">
            <form onSubmit={(e) => { e.preventDefault(); handleLogin(); }}>
            <div className="login-label">Email</div>
            <input
              className="login-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              onKeyDown={undefined}
            />

            <div className="login-label">Password</div>
            <input
              className="login-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              onKeyDown={undefined}
            />
            

            <div className="login-label" style={{ marginBottom: 8 }}>Role</div>
            <div className="role-grid">
              {ROLES.map((r) => (
                <button
                  key={r}
                  className={`role-btn ${role === r ? "selected" : ""}`}
                  onClick={() => setRole(r)}
                >
                  <div className="role-btn-name">{r}</div>
                  <div className="role-btn-desc">{ROLE_DESCRIPTIONS[r]}</div>
                </button>
              ))}
            </div>

            <button
              className="login-submit"
              type="submit"
              // onClick={handleLogin}
              // disabled={loading}
            >
              {loading ? "Signing in…" : "Sign in as " + role}
            </button>

            {error && <div className="login-error">{error}</div>}
          </form>
          </div>
          
        </div>
      </div>
    </>
  );
}
