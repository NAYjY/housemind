// components/workspace/ShellView.tsx
"use client";

import { SubprojectNav } from "./SubprojectNav";
import styles from "./WorkspaceShell.module.css";

export function ShellView({ projectId }: { projectId: string }) {
  return (
    <div className="hm-app">
      <div className={styles.heroBar}>
        <div>
          <div className={styles.wordmark}>House<span>Mind</span></div>
          <div className={styles.heroSub}>Visual decisions workspace</div>
        </div>
        <a href="/th/profile" style={{ textDecoration: "none" }}>
          <button className={styles.roleBadge}>← โครงการ</button>
        </a>
      </div>

      <div className={styles.projNav}>
        <SubprojectNav projectId={projectId} isShell={true} />
      </div>

      <div className={styles.shellEmpty}>
        <div className={styles.shellEmptyIcon}>🏗️</div>
        <div className={styles.shellEmptyTitle}>เลือกโครงการย่อย</div>
        <div className={styles.shellEmptyDesc}>
          กดชื่อโครงการด้านบนเพื่อเลือกหรือเพิ่มโครงการย่อย
        </div>
      </div>
    </div>
  );
}