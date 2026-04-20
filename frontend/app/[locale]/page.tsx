// app/[locale]/page.tsx — HouseMind landing page
// Uses Link from i18n/routing so locale prefix is added automatically.
// /th/workspace/demo/... instead of hardcoded /workspace/demo/...

import Link from "next/link";

export default function LandingPage() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500&display=swap');
        :root {
          --stone-50:#FAFAF8; --stone-100:#F5F4F0; --stone-200:#E8E6E0;
          --stone-300:#D4D1C7; --stone-500:#888780; --stone-900:#1A1A18;
          --accent:#7F77DD; --gold:#C9A84C; --gold-light:#F5EDD4;
        }
        .hm-land { font-family:'DM Sans',sans-serif; background:#E8E6E0; min-height:100vh; display:flex; flex-direction:column; align-items:center; padding:32px 16px 64px; }
        .hm-land-card { background:var(--stone-50); width:100%; max-width:430px; box-shadow:0 8px 40px rgba(0,0,0,0.18); overflow:hidden; }
        .hm-land-hero { background:var(--stone-900); padding:40px 28px 36px; }
        .hm-land-wordmark { font-family:'DM Serif Display',serif; font-size:38px; color:#fff; letter-spacing:-0.02em; line-height:1; margin-bottom:6px; }
        .hm-land-wordmark span { color:var(--gold); }
        .hm-land-sub { font-size:11px; color:rgba(255,255,255,0.38); letter-spacing:0.16em; text-transform:uppercase; margin-bottom:28px; }
        .hm-land-desc { font-size:14px; color:rgba(255,255,255,0.55); line-height:1.7; max-width:320px; margin-bottom:28px; }
        .hm-land-cta { display:inline-block; background:var(--gold); color:#3A2E10; font-family:'DM Sans',sans-serif; font-size:12px; font-weight:500; letter-spacing:0.06em; text-transform:uppercase; padding:12px 22px; border-radius:6px; text-decoration:none; }
        .hm-land-body { padding:24px 24px 32px; }
        .hm-land-features { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:28px; }
        .hm-land-feat { background:var(--stone-100); border-radius:10px; padding:14px; border:0.5px solid var(--stone-200); }
        .hm-land-feat-icon { font-size:20px; margin-bottom:6px; }
        .hm-land-feat-title { font-size:12px; font-weight:500; color:var(--stone-900); margin-bottom:2px; }
        .hm-land-feat-desc { font-size:10px; color:var(--stone-500); line-height:1.5; }
        .hm-land-roles { display:flex; gap:6px; flex-wrap:wrap; }
        .hm-land-role { font-size:10px; font-weight:500; letter-spacing:0.06em; text-transform:uppercase; padding:4px 10px; border-radius:20px; border:0.5px solid var(--stone-200); color:var(--stone-500); background:var(--stone-100); }
      `}</style>

      <div className="hm-land">
        <div className="hm-land-card">
          <div className="hm-land-hero">
            <div className="hm-land-wordmark">House<span>Mind</span></div>
            <div className="hm-land-sub">Visual decisions workspace</div>
            <div className="hm-land-desc">
              แพลตฟอร์มสำหรับทีมก่อสร้าง — ทำหมายเหตุบนรูปภาพ เชื่อมโยงสินค้า และตัดสินใจร่วมกัน
            </div>
            {/* Link from i18n/routing — adds /th/ prefix automatically */}
            <Link
              href="/login"
              className="hm-land-cta"
            >
              Sign In to Workspace →
            </Link>
          </div>

          <div className="hm-land-body">
            <div className="hm-land-features">
              {[
                { icon: "📍", title: "Annotate",      desc: "Tap any image to drop a pin" },
                { icon: "🎞", title: "Filmstrip",     desc: "Manage multiple reference images" },
                { icon: "✅", title: "Resolve",       desc: "Track decisions to completion" },
                { icon: "🔗", title: "Link Products", desc: "Attach specs and pricing" },
              ].map((f) => (
                <div key={f.title} className="hm-land-feat">
                  <div className="hm-land-feat-icon">{f.icon}</div>
                  <div className="hm-land-feat-title">{f.title}</div>
                  <div className="hm-land-feat-desc">{f.desc}</div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 10, color: "var(--stone-500)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
              Roles
            </div>
            <div className="hm-land-roles">
              {["Architect", "Contractor", "Homeowner", "Supplier"].map((r) => (
                <span key={r} className="hm-land-role">{r}</span>
              ))}
            </div>

            <div style={{ marginTop: 24 }}>
              <Link href="/login" style={{ fontSize: 12, color: "var(--stone-500)", textDecoration: "none" }}>
                Sign in →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}