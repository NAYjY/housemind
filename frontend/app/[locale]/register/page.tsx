"use client";

/**
 * app/[locale]/auth/register/page.tsx — HouseMind
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { storeSession, setLocale } from "@/lib/auth";

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

const ROLES = [
  { value: "architect",  label: "สถาปนิก",       desc: "Create & manage projects"    },
  { value: "contractor", label: "ผู้รับเหมา",     desc: "View & resolve annotations"  },
  { value: "homeowner",  label: "เจ้าของบ้าน",   desc: "Review decisions read-only"  },
  { value: "supplier",   label: "ผู้จัดจำหน่าย", desc: "Manage product catalogue"    },
] as const;

type Role = typeof ROLES[number]["value"];

export default function RegisterPage() {
  const router = useRouter();

  const [email,    setEmail]    = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [role,     setRole]     = useState<Role>("architect");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  async function handleRegister() {
    if (!email.trim() || !fullName.trim() || !password || !confirm) return;
    if (password !== confirm) {
      setError("รหัสผ่านไม่ตรงกัน · Passwords don't match");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email:     email.trim(),
          password,
          full_name: fullName.trim(),
          role,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? `Error ${res.status}`);
      }

      const data = await res.json();
      storeSession({ access_token: data.access_token, role: data.role, user_id: data.user_id });
      setLocale("th");
      router.push("/th/profile");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">

        <div className="login-header">
          <div className="login-wordmark">House<span>Mind</span></div>
          <div className="login-sub">สร้างบัญชีใหม่ · Create your account</div>
        </div>

        <div className="login-body">
          <form onSubmit={(e) => { e.preventDefault(); handleRegister(); }}>

            <div className="login-label">ชื่อ-สกุล · Full name</div>
            <input
              className="login-input"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="กรอกชื่อ-สกุล"
              autoComplete="name"
              required
            />

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

            <div className="login-label">รหัสผ่าน · Password</div>
            <input
              className="login-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="อย่างน้อย 8 ตัว มีตัวพิมพ์ใหญ่+เล็ก+ตัวเลข"
              autoComplete="new-password"
              required
            />

            <div className="login-label">ยืนยันรหัสผ่าน · Confirm password</div>
            <input
              className="login-input"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              required
            />

            <div className="login-label" style={{ marginBottom: 8 }}>บทบาทของคุณ · Your role</div>
            <div className="role-grid" style={{ marginBottom: 8 }}>
              {ROLES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  className={`role-btn ${role === r.value ? "selected" : ""}`}
                  onClick={() => setRole(r.value)}
                >
                  <div className="role-btn-name">{r.label}</div>
                  <div className="role-btn-desc">{r.desc}</div>
                </button>
              ))}
            </div>

            {/* Hint: architect adds you to a project after you register */}
            {(role === "contractor" || role === "homeowner" || role === "supplier") && (
              <div style={{
                fontSize: 11, color: "#8B6520",
                background: "#FEF3DC", border: "1px solid #F0D890",
                borderRadius: 8, padding: "8px 12px",
                marginBottom: 12, lineHeight: 1.6,
              }}>
                💡 หลังจากสมัครแล้ว แจ้ง email ของคุณให้สถาปนิกเพื่อเพิ่มคุณเข้าโครงการ<br />
                <span style={{ color: "#B0A090" }}>
                  After registering, share your email with the architect so they can add you to the project.
                </span>
              </div>
            )}

            <div style={{ fontSize: 11, color: "var(--color-text-hint)", marginBottom: 12, lineHeight: 1.5 }}>
              รหัสผ่านต้องมี 8+ ตัว · ตัวพิมพ์ใหญ่ · ตัวพิมพ์เล็ก · ตัวเลข
            </div>

            {error && <div className="login-error">{error}</div>}

            <button
              className="login-submit"
              type="submit"
              disabled={loading}
              style={{ marginTop: 8 }}
            >
              {loading ? "กำลังสร้างบัญชี…" : "สร้างบัญชี · Register"}
            </button>
          </form>

          <div style={{ marginTop: 16, textAlign: "center", fontSize: 12, color: "var(--stone-500)" }}>
            มีบัญชีแล้ว?{" "}
            <a href="/th/login" style={{ color: "var(--color-accent)" }}>
              เข้าสู่ระบบ · Sign in
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}