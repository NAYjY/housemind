/**
 * app/auth/expired/page.tsx — HouseMind
 * Shown when JWT is invalid, expired, or missing.
 * Bilingual (Thai/English). No authentication required to view.
 */
export default function AuthExpiredPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-surface-muted)",
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 400,
          width: "100%",
          background: "var(--color-surface)",
          borderRadius: 20,
          padding: "40px 32px",
          boxShadow: "0 8px 40px rgba(0,0,0,0.08)",
          textAlign: "center",
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "var(--color-accent-light)",
            margin: "0 auto 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <path
              d="M14 3a11 11 0 100 22A11 11 0 0014 3zm0 6v6m0 4v.5"
              stroke="var(--color-accent)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* Thai heading */}
        <h1
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "var(--color-text-primary)",
            marginBottom: 8,
            lineHeight: 1.3,
          }}
        >
          ลิงก์หมดอายุแล้ว
        </h1>

        {/* English subheading */}
        <p
          style={{
            fontSize: 14,
            color: "var(--color-text-muted)",
            marginBottom: 24,
            lineHeight: 1.6,
          }}
        >
          Session expired — please request a new invite link from the architect.
          <br />
          <span style={{ fontSize: 12 }}>กรุณาขอลิงก์ใหม่จากสถาปนิก</span>
        </p>

        {/* Divider */}
        <div
          style={{
            height: "0.5px",
            background: "var(--color-border)",
            margin: "24px 0",
          }}
        />

        <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          HouseMind · ระบบจัดการโครงการก่อสร้าง
        </p>
      </div>
    </main>
  );
}
