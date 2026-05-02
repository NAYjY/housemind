/**
 * app/[locale]/auth/expired/page.tsx — HouseMind
 * Shown when JWT is invalid, expired, or missing.
 */
import styles from "./Auth.module.css";

export default function AuthExpiredPage() {
  return (
    <main className={styles.authPage}>
      <div className={styles.authCard}>
        <div className={styles.authIconWrap}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <path
              d="M14 3a11 11 0 100 22A11 11 0 0014 3zm0 6v6m0 4v.5"
              stroke="var(--color-accent)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <h1 className={styles.authHeading}>ลิงก์หมดอายุแล้ว</h1>
        <p className={styles.authBody}>
          Session expired — please request a new invite link from the architect.
          <br />
          <small>กรุณาขอลิงก์ใหม่จากสถาปนิก</small>
        </p>
        <div className={styles.authDivider} />
        <p className={styles.authFooter}>HouseMind · ระบบจัดการโครงการก่อสร้าง</p>
      </div>
    </main>
  );
}