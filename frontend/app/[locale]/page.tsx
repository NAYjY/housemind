// app/[locale]/page.tsx — HouseMind landing page
// Mobile-first · Thai-primary · Loss-aversion framing

import Link from "next/link";
import styles from "./LandingPage.module.css";

export default function LandingPage() {
  return (
    <div className={styles.lp}>
      <div className={styles.lpInner}>

        {/* Nav */}
        <div className={styles.lpNav}>
          <div className={styles.lpBrand}>House<span>Mind</span></div>
          <Link href="/login" className={styles.lpNavLogin}>เข้าสู่ระบบ →</Link>
        </div>

        {/* Hero */}
        <div className={styles.lpHero}>
          <div className={styles.lpBadge}>
            <div className={styles.lpBadgeDot} />
            สำหรับสถาปนิกและทีมก่อสร้างไทย
          </div>
          <h1 className={styles.lpH1}>
            ทุกการตัดสินใจ<br />อยู่บนภาพ<br /><em>ไม่ใช่ในเอกสาร</em>
          </h1>
          <div className={styles.lpH1En}>Every decision, on the image — not in a document.</div>
          <p className={styles.lpSub}>
            เจ้าของบ้านอนุมัติกระเบื้องผิดเพราะ<strong>ดู PDF ไม่เข้าใจ</strong><br />
            ปัญหานั้นจบได้ตั้งแต่วันแรก
          </p>
          <div className={styles.lpCtaRow}>
            <Link href="/login" className={styles.lpBtnMain}>เข้าสู่ระบบ</Link>
            <Link
              href="/workspace/demo/demo-image?src=https://images.unsplash.com/photo-1555041469-a586c61ea9bc&readOnly=true"
              className={styles.lpBtnDemo}
            >
              ดูตัวอย่าง
            </Link>
          </div>
        </div>

        <div className={styles.lpDivider} />

        {/* Pain */}
        <div className={styles.lpSection}>
          <div className={styles.lpKicker}>ปัญหาที่เจอทุกโครงการ</div>
          <h2 className={styles.lpH2}>คุณจัดการการตัดสินใจผ่านช่องทางที่ไม่ได้ออกแบบมาเพื่องานนี้</h2>
          <p className={styles.lpCap}>Line, PDF, Voice note — กระจัดกระจาย ไม่มีใครรับผิดชอบชัดเจน</p>
          <div className={styles.lpCards}>
            {[
              { icon: "💬", title: "Line / WhatsApp", desc: "ข้อความที่เห็นด้วยกับสีผนัง ถูกทับด้วยสติกเกอร์ 3 วันให้หลัง ไม่มีใครจำได้ว่าตกลงอะไร", tag: "ไม่มีบันทึกที่ชัดเจน" },
              { icon: "📄", title: "PDF สเปค", desc: "เห็นแต่รหัสสินค้า ไม่เห็นภาพ ไม่รู้ว่าวางตรงไหน อนุมัติไปเพราะเชื่อใจ ไม่ใช่เพราะเข้าใจ", tag: "เข้าใจผิดบ่อย" },
              { icon: "🎙", title: "Voice note", desc: "ผู้รับเหมาฟัง 2 นาที ทำงานตาม แต่สถาปนิกหมายถึงอีกจุด ต้องรื้อใหม่", tag: "ค่าใช้จ่ายสูงขึ้น" },
            ].map((item) => (
              <div key={item.title} className={styles.lpCard}>
                <div className={styles.lpCardIcon}>{item.icon}</div>
                <div>
                  <div className={styles.lpCardTitle}>{item.title}</div>
                  <div className={styles.lpCardDesc}>{item.desc}</div>
                  <span className={styles.lpTagRed}>{item.tag}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.lpDivider} />

        {/* Solve */}
        <div className={styles.lpSection}>
          <div className={styles.lpKicker}>HouseMind แก้ตรงจุด</div>
          <h2 className={styles.lpH2}>หมุดบนภาพ แทนคำอธิบายที่เข้าใจผิดได้</h2>
          <p className={styles.lpCap}>ทีมก่อสร้างทุกคนเห็นภาพเดียวกัน ตัดสินใจบนบริบทเดียวกัน</p>
          <div className={styles.lpCards}>
            {[
              { num: "1", title: "แตะบนรูปห้อง ปักหมุดได้เลย", desc: "ระบุตำแหน่งสินค้าบนภาพจริง เจ้าของบ้านเห็นปุ๊บเข้าใจปั๊บ ไม่ต้องตีความ", tag: "เข้าใจทันที" },
              { num: "2", title: "สเปค ราคา รูปสินค้า อยู่ในหมุดเดียว", desc: "ไม่ต้องเปิด PDF คู่กัน ทุกอย่างอยู่ที่เดิม คลิกเดียวเห็นทั้งหมด", tag: "ข้อมูลครบในที่เดียว" },
              { num: "3", title: "กด Resolve เมื่อตกลงแล้ว", desc: "ประวัติการตัดสินใจชัดเจน ไม่มีใครย้อนกลับมาเถียงภายหลัง", tag: "ติดตามได้ตลอด" },
            ].map((item) => (
              <div key={item.num} className={styles.lpCard}>
                <div className={styles.lpCardNum}>{item.num}</div>
                <div>
                  <div className={styles.lpCardTitle}>{item.title}</div>
                  <div className={styles.lpCardDesc}>{item.desc}</div>
                  <span className={styles.lpTagGreen}>{item.tag}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.lpDivider} />

        {/* Roles */}
        <div className={styles.lpSection} style={{ paddingBottom: "20px" }}>
          <div className={styles.lpRolesLabel}>เข้าถึงได้ทุกบทบาทในโครงการ</div>
          <div className={styles.lpRolesRow}>
            {["สถาปนิก", "ผู้รับเหมา", "เจ้าของบ้าน", "ผู้จัดจำหน่าย"].map((r) => (
              <span key={r} className={styles.lpRolePill}>{r}</span>
            ))}
          </div>
        </div>

        {/* Footer CTA */}
        <div className={styles.lpFooterCta}>
          <div className={styles.lpFooterEyebrow}>พร้อมแล้ว?</div>
          <div className={styles.lpFooterH}>ทดลองใช้กับโครงการจริงได้เลย</div>
          <div className={styles.lpFooterSub}>สถาปนิกที่ได้รับลิงก์เชิญสามารถเข้าใช้งานได้ทันที ไม่ต้องติดตั้งแอป</div>
          <Link href="/login" className={styles.lpFooterBtn}>เริ่มกันเลย →</Link>
        </div>

        {/* Bottom bar */}
        <div className={styles.lpBottomBar}>
          <div className={styles.lpBottomBrand}>House<span>Mind</span></div>
          <div className={styles.lpBottomCopy}>ระบบจัดการโครงการก่อสร้าง</div>
        </div>

      </div>
    </div>
  );
}