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
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500&display=swap');
        :root {
          --stone-50:#FAFAF8;--stone-100:#F5F4F0;--stone-200:#E8E6E0;
          --stone-500:#888780;--stone-900:#1A1A18;
          --accent:#7F77DD;--gold:#C9A84C;
        }
        .login-wrap {
          font-family: 'DM Sans', sans-serif;
          min-height: 100vh;
          background: #E8E6E0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }
        .login-card {
          background: var(--stone-50);
          width: 100%;
          max-width: 380px;
          border-radius: 2px;
          box-shadow: 0 8px 40px rgba(0,0,0,0.18);
          overflow: hidden;
        }
        .login-header {
          background: var(--stone-900);
          padding: 28px 28px 24px;
        }
        .login-wordmark {
          font-family: 'DM Serif Display', serif;
          font-size: 26px;
          color: #fff;
          letter-spacing: -0.02em;
          margin-bottom: 4px;
        }
        .login-wordmark span { color: var(--gold); }
        .login-sub {
          font-size: 10px;
          color: rgba(255,255,255,0.35);
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        .login-body { padding: 24px 28px 28px; }
        .login-dev-badge {
          display: inline-block;
          font-size: 9px;
          font-weight: 500;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          padding: 3px 8px;
          border-radius: 4px;
          background: #FEF3C7;
          color: #92400E;
          margin-bottom: 20px;
          border: 0.5px solid #FDE68A;
        }
        .login-label {
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--stone-500);
          margin-bottom: 6px;
        }
        .login-input {
          width: 100%;
          height: 40px;
          border: 0.5px solid var(--stone-200);
          border-radius: 8px;
          padding: 0 12px;
          font-family: 'DM Sans', sans-serif;
          font-size: 13px;
          color: var(--stone-900);
          background: #fff;
          outline: none;
          margin-bottom: 16px;
          box-sizing: border-box;
        }
        .login-input:focus { border-color: var(--accent); }
        .role-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-bottom: 20px;
        }
        .role-btn {
          padding: 10px 8px;
          border-radius: 8px;
          border: 0.5px solid var(--stone-200);
          background: var(--stone-100);
          cursor: pointer;
          text-align: left;
          transition: border-color 0.15s, background 0.15s;
          font-family: 'DM Sans', sans-serif;
        }
        .role-btn.selected {
          border-color: var(--accent);
          background: #EEEDFE;
        }
        .role-btn-name {
          font-size: 12px;
          font-weight: 500;
          color: var(--stone-900);
          margin-bottom: 2px;
          text-transform: capitalize;
        }
        .role-btn.selected .role-btn-name { color: var(--accent); }
        .role-btn-desc {
          font-size: 9px;
          color: var(--stone-500);
          line-height: 1.4;
        }
        .login-submit {
          width: 100%;
          height: 44px;
          background: var(--stone-900);
          color: #fff;
          border: none;
          border-radius: 8px;
          font-family: 'DM Sans', sans-serif;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          letter-spacing: 0.04em;
          transition: background 0.15s;
        }
        .login-submit:hover:not(:disabled) { background: var(--accent); }
        .login-submit:disabled { opacity: 0.5; cursor: wait; }
        .login-error {
          font-size: 12px;
          color: #E24B4A;
          margin-top: 10px;
          padding: 8px 12px;
          background: #FEF2F2;
          border-radius: 6px;
          border: 0.5px solid #FECACA;
        }
      `}</style>

      <div className="login-wrap">
        <div className="login-card">
          <div className="login-header">
            <div className="login-wordmark">House<span>Mind</span></div>
            <div className="login-sub">Visual decisions workspace</div>
          </div>

          <div className="login-body">
            
            <div className="login-label">Email</div>
            <input
              className="login-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            />

            <div className="login-label">Password</div>
            <input
              className="login-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
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
              onClick={handleLogin}
              disabled={loading}
            >
              {loading ? "Signing in…" : "Sign in as " + role}
            </button>

            {error && <div className="login-error">{error}</div>}
          </div>
        </div>
      </div>
    </>
  );
}
