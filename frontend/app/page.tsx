// app/page.tsx — HouseMind landing page
import Link from "next/link";

export default function LandingPage() {
  return (
    <>
      <style>{`
        .hm-landing { min-height: 100vh; background: var(--color-surface-muted); display: flex; flex-direction: column; }
        .hm-nav { display: flex; align-items: center; justify-content: space-between; padding: 0 24px; height: 60px; background: var(--color-surface); border-bottom: 0.5px solid var(--color-border); }
        .hm-hero { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 24px 80px; text-align: center; }
        .hm-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; max-width: 760px; width: 100%; margin: 48px auto 0; padding: 0 24px; }
        .hm-card { background: var(--color-surface); border-radius: var(--radius-md); padding: 20px; border: 0.5px solid var(--color-border); text-align: left; }
        @media (max-width: 600px) { .hm-cards { grid-template-columns: 1fr; } }
      `}</style>

      <div className="hm-landing">
        {/* Nav */}
        <nav className="hm-nav">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: "var(--color-accent)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 10L7 2l5 8H2z" fill="white" />
              </svg>
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--color-text-primary)" }}>
              HouseMind
            </span>
          </div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            ระบบจัดการโครงการก่อสร้าง
          </div>
        </nav>

        {/* Hero */}
        <div className="hm-hero">
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "var(--color-accent-light)", color: "var(--color-accent)",
            fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: 20,
            letterSpacing: "0.05em", marginBottom: 24,
          }}>
            ✦ VISUAL BUILDING DECISIONS
          </div>

          <h1 style={{
            fontSize: "clamp(28px, 5vw, 48px)", fontWeight: 800,
            color: "var(--color-text-primary)", lineHeight: 1.15,
            maxWidth: 600, marginBottom: 16,
          }}>
            พื้นที่ตัดสินใจ<br />
            <span style={{ color: "var(--color-accent)" }}>ก่อสร้างร่วมกัน</span>
          </h1>

          <p style={{
            fontSize: 15, color: "var(--color-text-muted)",
            maxWidth: 460, lineHeight: 1.7, marginBottom: 36,
          }}>
            แพลตฟอร์มสำหรับสถาปนิก ผู้รับเหมา และเจ้าของบ้าน
            เพื่อทำหมายเหตุและตัดสินใจร่วมกันบนรูปภาพโครงการ
          </p>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
            <Link
              href="/workspace/demo-project/demo-image?src=/placeholder-room.jpg"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                background: "var(--color-accent)", color: "#fff",
                fontSize: 14, fontWeight: 600,
                padding: "13px 24px", borderRadius: "var(--radius-sm)", // Fixed: added quotes
                textDecoration: "none",
                boxShadow: "0 4px 16px rgba(127,119,221,0.35)",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="1" width="14" height="14" rx="3" stroke="white" strokeWidth="1.5" />
                <circle cx="8" cy="8" r="2" fill="white" />
              </svg>
              ลองใช้งาน · Try Demo
            </Link>
            <a
              href="https://docs.housemind.app"
              style={{
                display: "inline-flex", alignItems: "center",
                background: "var(--color-surface)", color: "var(--color-text-primary)",
                fontSize: 14, fontWeight: 500,
                padding: "13px 24px", borderRadius: "var(--radius-sm)", // Fixed: added quotes
                textDecoration: "none",
                border: "0.5px solid var(--color-border)",
              }}
            >
              เอกสาร · Docs →
            </a>
          </div>
        </div>

        {/* Feature cards */}
        <div className="hm-cards">
          {[
            { icon: "📍", th: "หมายเหตุบนรูปภาพ", en: "Pin annotations on any image with tap or click", },
            { icon: "✅", th: "ติดตามสถานะ", en: "Resolve threads — architect & contractor only", },
            { icon: "🔗", th: "เชื่อมโยงสินค้า", en: "Link products with specs and pricing to pins", },
            { icon: "👥", th: "หลายบทบาท", en: "Architect · Contractor · Homeowner · Supplier", },
          ].map((f) => (
            <div key={f.th} className="hm-card">
              <div style={{ fontSize: 24, marginBottom: 10 }}>{f.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 4 }}>{f.th}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)", lineHeight: 1.5 }}>{f.en}</div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          textAlign: "center", padding: "40px 24px 32px",
          fontSize: 11, color: "var(--color-text-muted)",
        }}>
          HouseMind · ระบบจัดการโครงการก่อสร้าง · {new Date().getFullYear()}
        </div>
      </div>
    </>
  );
}