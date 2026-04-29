/**
 * app/auth/expired/page.tsx — HouseMind
 * Shown when JWT is invalid, expired, or missing.
 * Bilingual (Thai/English). No authentication required to view.
 */
export default function AuthExpiredPage() {
  return (
  <main className="hm-auth-page">
    <div className="hm-auth-card">
      <div className="hm-auth-icon-wrap">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <path
            d="M14 3a11 11 0 100 22A11 11 0 0014 3zm0 6v6m0 4v.5"
            stroke="var(--color-accent)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <h1 className="hm-auth-heading">ลิงก์หมดอายุแล้ว</h1>
      <p className="hm-auth-body">
        Session expired — please request a new invite link from the architect.
        <br />
        <small>กรุณาขอลิงก์ใหม่จากสถาปนิก</small>
      </p>
      <div className="hm-auth-divider" />
      <p className="hm-auth-footer">HouseMind · ระบบจัดการโครงการก่อสร้าง</p>
    </div>
  </main>
);
}
