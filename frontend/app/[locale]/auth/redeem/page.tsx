"use client";

/**
 * app/auth/redeem/page.tsx — HouseMind
 * Reads ?token= from URL, calls POST /v1/auth/redeem, stores JWT, redirects.
 * This is the landing page when an invitee clicks the magic link.
 */

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { setToken, setLocale } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

type State = "loading" | "success" | "error";

export default function RedeemPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [state, setState] = useState<State>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setState("error");
      setErrorMsg("ไม่พบ token ในลิงก์ · No token in link");
      return;
    }

    async function redeem() {
      try {
        const res = await fetch(`${API_BASE}/auth/redeem`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setState("error");
          setErrorMsg(body.detail ?? "ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว");
          return;
        }

        const data = await res.json();
        setToken(data.access_token);

        // Set locale based on role (Thai for all roles at MVP)
        setLocale("th");

        setState("success");

        // Redirect after brief success flash
        setTimeout(() => {
          const redirectTo = params.get("from") ?? "/";
          router.replace(redirectTo);
        }, 800);
      } catch {
        setState("error");
        setErrorMsg("เกิดข้อผิดพลาดในการเชื่อมต่อ · Connection error");
      }
    }

    redeem();
  }, [params, router]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-surface-muted)",
      }}
    >
      <div
        style={{
          background: "var(--color-surface)",
          borderRadius: 20,
          padding: "40px 32px",
          maxWidth: 360,
          width: "100%",
          textAlign: "center",
          boxShadow: "0 8px 40px rgba(0,0,0,0.08)",
        }}
      >
        {state === "loading" && (
          <>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                border: "3px solid var(--color-accent-light)",
                borderTop: "3px solid var(--color-accent)",
                animation: "hm-spin 0.7s linear infinite",
                margin: "0 auto 20px",
              }}
            />
            <p style={{ fontSize: 15, color: "var(--color-text-primary)", fontWeight: 500 }}>กำลังยืนยันตัวตน…</p>
            <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 6 }}>Verifying your link</p>
          </>
        )}
        {state === "success" && (
          <>
            <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--color-success)" }}>เข้าสู่ระบบสำเร็จ</p>
            <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 6 }}>Redirecting…</p>
          </>
        )}
        {state === "error" && (
          <>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⚠</div>
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--color-error)" }}>ไม่สามารถเข้าสู่ระบบได้</p>
            <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 8, lineHeight: 1.5 }}>{errorMsg}</p>
          </>
        )}
        <style>{`@keyframes hm-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </main>
  );
}
