"use client";

/**
 * app/[locale]/auth/register/page.tsx — HouseMind
 * Self-registration (architects primarily).
 * Mirrors login page style.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { storeSession, setLocale } from "@/lib/auth";

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

const ROLES = [
  { value: "architect",  label: "สถาปนิก",       desc: "Create & manage projects" },
  { value: "contractor", label: "ผู้รับเหมา",     desc: "View & resolve issues"    },
  { value: "supplier",   label: "ผู้จัดจำหน่าย", desc: "Manage product catalogue" },
  // homeowner is invite-only — they don't self-register
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
      setError("Passwords don't match · รหัสผ่านไม่ตรงกัน");
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
        {/* Header */}
        <div className="login-header">
          <div className="login-wordmark">House<span>Mind</span></div>
          <div className="login-sub">สร้างบัญชีใหม่ · Create your account</div>
        </div>

        {/* Body */}
        <div className="login-body">
          <form onSubmit={(e) => { e.preventDefault(); handleRegister(); }}>

            {/* Full name */}
            <div className="login-label">Full name · ชื่อ-สกุล</div>
            <input
              className="login-input"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="กรอกชื่อ-สกุล"
              autoComplete="name"
              required
            />

            {/* Email */}
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

            {/* Password */}
            <div className="login-label">Password · รหัสผ่าน</div>
            <input
              className="login-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="อย่างน้อย 8 ตัว, มีตัวพิมพ์ใหญ่+เล็ก+ตัวเลข"
              autoComplete="new-password"
              required
            />

            {/* Confirm password */}
            <div className="login-label">Confirm password · ยืนยันรหัสผ่าน</div>
            <input
              className="login-input"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              required
            />

            {/* Role selector */}
            <div className="login-label" style={{ marginBottom: 8 }}>
              Role · บทบาทของคุณ
            </div>
            <div className="role-grid" style={{ marginBottom: 20 }}>
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

            {/* Password rules hint */}
            <div style={{ fontSize: 11, color: "var(--stone-500)", marginBottom: 12, lineHeight: 1.6 }}>
              รหัสผ่านต้องมี: 8+ ตัวอักษร · ตัวพิมพ์ใหญ่ · ตัวพิมพ์เล็ก · ตัวเลข<br />
              <span style={{ color: "var(--color-text-hint)" }}>Min 8 chars · uppercase · lowercase · number</span>
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

          <div style={{ marginTop: 10, textAlign: "center", fontSize: 11, color: "var(--color-text-hint)", lineHeight: 1.6 }}>
            เจ้าของบ้าน (Homeowner) เข้าร่วมผ่านลิงก์เชิญจากสถาปนิกเท่านั้น<br />
            Homeowners join via architect invite link only.
          </div>
        </div>
      </div>
    </div>
  );
}