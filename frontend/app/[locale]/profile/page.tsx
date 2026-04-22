"use client";

// app/[locale]/profile/page.tsx — HouseMind
// Light header, pill role tabs, project list per role.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useProjects, type ProjectListItem } from "@/hooks/useProjects";
import { clearToken } from "@/lib/auth";

const ROLES = ["architect", "contractor", "homeowner", "supplier"] as const;
type Role = typeof ROLES[number];

const ROLE_META: Record<Role, { th: string; icon: string; desc: string }> = {
  architect:  { th: "สถาปนิก",       icon: "✏️", desc: "Create & manage projects"   },
  contractor: { th: "ผู้รับเหมา",     icon: "🔨", desc: "View & resolve annotations" },
  homeowner:  { th: "เจ้าของบ้าน",   icon: "🏠", desc: "Review decisions read-only" },
  supplier:   { th: "ผู้จัดจำหน่าย", icon: "📦", desc: "Manage product catalogue"   },
};

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", {
    day: "numeric", month: "short", year: "2-digit",
  });
}

function ProjectCard({ project, onClick }: { project: ProjectListItem; onClick: () => void }) {
  const chipClass = ["draft","active","completed","archived"].includes(project.status)
    ? project.status
    : "draft";

  return (
    <div className="profile-proj-card" onClick={onClick}>
      <div className="profile-proj-icon">
        {project.name[0]?.toUpperCase() ?? "P"}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="profile-proj-name">{project.name}</div>
        <div className="profile-proj-date">{fmt(project.created_at)}</div>
      </div>
      <div className={`profile-proj-chip ${chipClass}`}>
        {chipClass.charAt(0).toUpperCase() + chipClass.slice(1)}
      </div>
      <svg width="7" height="12" viewBox="0 0 7 12" fill="none" style={{ flexShrink: 0 }}>
        <path d="M1 1l5 5-5 5" stroke="#C8B898" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const auth = useAuth();
  const { data: projects = [], isLoading, error } = useProjects();

  const [activeRole, setActiveRole] = useState<Role>(
    (auth.role as Role) ?? "architect"
  );

  function handleSignOut() {
    clearToken();
    router.push("/login");
  }

  function handleProjectClick(project: ProjectListItem) {
    router.push(`/th/workspace/${project.id}/${project.id}`);
  }

  const isActiveRole = activeRole === auth.role;
  const displayProjects = isActiveRole ? projects : [];

  return (
    <div className="profile-wrap">
      {/* ── Header ── */}
      <div className="profile-header">
        <div className="profile-topbar">
          <div className="profile-wordmark">
            House<span>Mind</span>
          </div>
          <button className="profile-signout" onClick={handleSignOut}>
            ออกจากระบบ
          </button>
        </div>

        {/* User row */}
        <div className="profile-user-row">
          <div className="profile-avatar">
            {auth.user?.email?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div>
            <div className="profile-user-name">
              {auth.user?.email?.split("@")[0] ?? "Loading…"}
            </div>
            <div className="profile-user-email">
              {auth.user?.email ?? ""}
            </div>
          </div>
        </div>

        {/* Role pill tabs */}
        <div className="profile-role-tabs">
          {ROLES.map((role) => {
            const meta = ROLE_META[role];
            const isJwtRole = role === auth.role;
            return (
              <button
                key={role}
                className={`profile-role-tab ${activeRole === role ? "active" : ""}`}
                onClick={() => setActiveRole(role)}
              >
                <span className="profile-role-tab-icon">{meta.icon}</span>
                <span className="profile-role-tab-name">{meta.th}</span>
                {isJwtRole && <span className="profile-active-dot" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="profile-body">
        <div className="profile-section-label">{ROLE_META[activeRole].th}</div>
        <div className="profile-section-desc">{ROLE_META[activeRole].desc}</div>

        {/* Loading */}
        {isLoading && isActiveRole && (
          <div className="profile-loading">
            {[1, 2, 3].map((n) => <div key={n} className="profile-skeleton" />)}
          </div>
        )}

        {/* Error */}
        {error && isActiveRole && (
          <div style={{
            padding: 16, background: "#FEF2F2",
            border: "0.5px solid #FECACA", borderRadius: 12,
            fontSize: 12, color: "#E24B4A",
          }}>
            Could not load projects. Check your connection.
          </div>
        )}

        {/* Project list */}
        {!isLoading && isActiveRole && displayProjects.length > 0 && (
          <>
            <div className="profile-project-list">
              {displayProjects.map((p) => (
                <ProjectCard key={p.id} project={p} onClick={() => handleProjectClick(p)} />
              ))}
            </div>
            {activeRole === "architect" && (
              <button className="profile-new-btn" onClick={() => alert("Create project — coming soon")}>
                <span style={{ fontSize: 16 }}>+</span>
                สร้างโครงการใหม่ · New Project
              </button>
            )}
          </>
        )}

        {/* Empty — correct role, no projects */}
        {!isLoading && isActiveRole && displayProjects.length === 0 && !error && (
          <div className="profile-empty">
            <div className="profile-empty-icon">{ROLE_META[activeRole].icon}</div>
            <div className="profile-empty-title">
              {activeRole === "architect" ? "ยังไม่มีโครงการ" : "ยังไม่มีโครงการที่เข้าร่วม"}
            </div>
            <div className="profile-empty-sub">
              {activeRole === "architect"
                ? "Create your first project to get started."
                : "You'll see projects here once an architect invites you."}
            </div>
            {activeRole === "architect" && (
              <button className="profile-new-btn" onClick={() => alert("Create project — coming soon")}>
                <span style={{ fontSize: 16 }}>+</span>
                สร้างโครงการแรก
              </button>
            )}
          </div>
        )}

        {/* Wrong role selected */}
        {!isActiveRole && (
          <div className="profile-empty">
            <div className="profile-empty-icon">{ROLE_META[activeRole].icon}</div>
            <div className="profile-empty-title">{ROLE_META[activeRole].th}</div>
            <div className="profile-empty-sub">
              {`Your account is a ${auth.role ?? "unknown"} account.`}
              <br />
              Multi-role access coming soon.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}