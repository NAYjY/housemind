"use client";

/**
 * app/auth/redeem/page.tsx — HouseMind
 * Magic-link redemption removed (migration 004 / auth flow change).
 * Old magic-link URLs now redirect to /auth/expired.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RedeemPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/auth/expired");
  }, [router]);

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
      <p style={{ fontSize: 14, color: "var(--color-text-muted)" }}>กำลังเปลี่ยนหน้า…</p>
    </main>
  );
}