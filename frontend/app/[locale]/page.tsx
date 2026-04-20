// app/page.tsx — HouseMind landing page
// Mobile-first · Thai-primary · Loss-aversion framing

import Link from "next/link";

export default function LandingPage() {
  return (
    <>
      
      <div className="lp">
        <div className="lp-inner">

          {/* Nav */}
          <div className="lp-nav">
            <div className="lp-brand">House<span>Mind</span></div>
            <Link href="/login" className="lp-nav-login">เข้าสู่ระบบ →</Link>
          </div>

          {/* Hero */}
          <div className="lp-hero">
            <div className="lp-badge"><div className="lp-badge-dot" />สำหรับสถาปนิกและทีมก่อสร้างไทย</div>
            <h1 className="lp-h1">ทุกการตัดสินใจ<br />อยู่บนภาพ<br /><em>ไม่ใช่ในเอกสาร</em></h1>
            <div className="lp-h1-en">Every decision, on the image — not in a document.</div>
            <p className="lp-sub">เจ้าของบ้านอนุมัติกระเบื้องผิดเพราะ<strong>ดู PDF ไม่เข้าใจ</strong><br />ปัญหานั้นจบได้ตั้งแต่วันแรก</p>
            <div className="lp-cta-row">
              <Link href="/login" className="lp-btn-main">เข้าสู่ระบบ</Link>
              <Link href="/workspace/demo/demo-image?src=https://images.unsplash.com/photo-1555041469-a586c61ea9bc&readOnly=true" className="lp-btn-demo">ดูตัวอย่าง</Link>
            </div>
          </div>

          <div className="lp-divider" />

          {/* Pain */}
          <div className="lp-section">
            <div className="lp-kicker">ปัญหาที่เจอทุกโครงการ</div>
            <h2 className="lp-h2">คุณจัดการการตัดสินใจผ่านช่องทางที่ไม่ได้ออกแบบมาเพื่องานนี้</h2>
            <p className="lp-cap">Line, PDF, Voice note — กระจัดกระจาย ไม่มีใครรับผิดชอบชัดเจน</p>
            <div className="lp-cards">
              {[
                { icon: "💬", title: "Line / WhatsApp", desc: "ข้อความที่เห็นด้วยกับสีผนัง ถูกทับด้วยสติกเกอร์ 3 วันให้หลัง ไม่มีใครจำได้ว่าตกลงอะไร", tag: "ไม่มีบันทึกที่ชัดเจน" },
                { icon: "📄", title: "PDF สเปค", desc: "เห็นแต่รหัสสินค้า ไม่เห็นภาพ ไม่รู้ว่าวางตรงไหน อนุมัติไปเพราะเชื่อใจ ไม่ใช่เพราะเข้าใจ", tag: "เข้าใจผิดบ่อย" },
                { icon: "🎙", title: "Voice note", desc: "ผู้รับเหมาฟัง 2 นาที ทำงานตาม แต่สถาปนิกหมายถึงอีกจุด ต้องรื้อใหม่", tag: "ค่าใช้จ่ายสูงขึ้น" },
              ].map((item) => (
                <div key={item.title} className="lp-card">
                  <div className="lp-card-icon">{item.icon}</div>
                  <div>
                    <div className="lp-card-title">{item.title}</div>
                    <div className="lp-card-desc">{item.desc}</div>
                    <span className="lp-tag-red">{item.tag}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lp-divider" />

          {/* Solve */}
          <div className="lp-section">
            <div className="lp-kicker">HouseMind แก้ตรงจุด</div>
            <h2 className="lp-h2">หมุดบนภาพ แทนคำอธิบายที่เข้าใจผิดได้</h2>
            <p className="lp-cap">ทีมก่อสร้างทุกคนเห็นภาพเดียวกัน ตัดสินใจบนบริบทเดียวกัน</p>
            <div className="lp-cards">
              {[
                { num: "1", title: "แตะบนรูปห้อง ปักหมุดได้เลย", desc: "ระบุตำแหน่งสินค้าบนภาพจริง เจ้าของบ้านเห็นปุ๊บเข้าใจปั๊บ ไม่ต้องตีความ", tag: "เข้าใจทันที" },
                { num: "2", title: "สเปค ราคา รูปสินค้า อยู่ในหมุดเดียว", desc: "ไม่ต้องเปิด PDF คู่กัน ทุกอย่างอยู่ที่เดิม คลิกเดียวเห็นทั้งหมด", tag: "ข้อมูลครบในที่เดียว" },
                { num: "3", title: "กด Resolve เมื่อตกลงแล้ว", desc: "ประวัติการตัดสินใจชัดเจน ไม่มีใครย้อนกลับมาเถียงภายหลัง", tag: "ติดตามได้ตลอด" },
              ].map((item) => (
                <div key={item.num} className="lp-card">
                  <div className="lp-card-num">{item.num}</div>
                  <div>
                    <div className="lp-card-title">{item.title}</div>
                    <div className="lp-card-desc">{item.desc}</div>
                    <span className="lp-tag-green">{item.tag}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lp-divider" />

          {/* Roles */}
          <div className="lp-section" style={{ paddingBottom: "20px" }}>
            <div className="lp-roles-label">เข้าถึงได้ทุกบทบาทในโครงการ</div>
            <div className="lp-roles-row">
              {["สถาปนิก", "ผู้รับเหมา", "เจ้าของบ้าน", "ผู้จัดจำหน่าย"].map((r) => (
                <span key={r} className="lp-role-pill">{r}</span>
              ))}
            </div>
          </div>

          {/* Footer CTA */}
          <div className="lp-footer-cta">
            <div className="lp-footer-eyebrow">พร้อมแล้ว?</div>
            <div className="lp-footer-h">ทดลองใช้กับโครงการจริงได้เลย</div>
            <div className="lp-footer-sub">สถาปนิกที่ได้รับลิงก์เชิญสามารถเข้าใช้งานได้ทันที ไม่ต้องติดตั้งแอป</div>
            <Link href="/login" className="lp-footer-btn">เริ่มกันเลย →</Link>
          </div>

          {/* Bottom bar */}
          <div className="lp-bottom-bar">
            <div className="lp-bottom-brand">House<span>Mind</span></div>
            <div className="lp-bottom-copy">ระบบจัดการโครงการก่อสร้าง</div>
          </div>

        </div>
      </div>
    </>
  );
}