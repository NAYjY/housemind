"use client";

// app/[locale]/profile/page.tsx — HouseMind

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useProjects, useCreateProject, type ProjectListItem, type ProjectDetail } from "@/hooks/useProjects";
import { logout, authFetch } from "@/lib/auth";
import { InviteModal } from "@/components/project/InviteModal";

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

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

// ── Project card ──────────────────────────────────────────────────────────────

interface ProjectCardProps {
  project: ProjectListItem;
  onClick: () => void;
  onInvite: () => void;
  isArchitect: boolean;
}

function ProjectCard({ project, onClick, onInvite, isArchitect }: ProjectCardProps) {
  const chipClass = ["draft","active","completed","archived"].includes(project.status)
    ? project.status : "draft";

  return (
    <div style={{ position: "relative" }}>
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

      {isArchitect && (
        <button
          onClick={(e) => { e.stopPropagation(); onInvite(); }}
          style={{
            position: "absolute",
            right: 48,
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: 10,
            fontWeight: 700,
            color: "#8B6520",
            background: "#FEF3DC",
            border: "1px solid #F0D890",
            borderRadius: 20,
            padding: "4px 10px",
            cursor: "pointer",
            whiteSpace: "nowrap",
            letterSpacing: "0.04em",
          }}
        >
          + เชิญ
        </button>
      )}
    </div>
  );
}

// ── Create project modal ──────────────────────────────────────────────────────

interface CreateModalProps {
  onClose: () => void;
  onCreate: (name: string, description: string) => Promise<void>;
}

function CreateProjectModal({ onClose, onCreate }: CreateModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("ชื่อโครงการจำเป็น"); return; }
    setLoading(true);
    setError("");
    try {
      await onCreate(name.trim(), description.trim());
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally { setLoading(false); }
  }

  return (
    <div
      className="hm-create-modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="hm-create-modal-sheet">
        <div className="hm-create-modal-handle" />
        <div className="hm-create-modal-title">สร้างโครงการใหม่</div>
        <div className="hm-create-modal-sub">New Project</div>

        <form onSubmit={handleSubmit}>
          <div className="hm-create-modal-label">ชื่อโครงการ *</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="เช่น บ้านพักอาศัย สุขุมวิท 101"
            autoFocus
            className="hm-create-modal-input"
          />
          <div className="hm-create-modal-label">รายละเอียด (optional)</div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="รายละเอียดโครงการ..."
            rows={3}
            className="hm-create-modal-textarea"
          />
          {error && <div className="hm-create-modal-error">{error}</div>}
          <div className="hm-create-modal-actions">
            <button type="button" onClick={onClose} className="hm-create-modal-cancel">ยกเลิก</button>
            <button type="submit" disabled={loading || !name.trim()} className="hm-create-modal-submit">
              {loading ? "กำลังสร้าง…" : "สร้างโครงการ"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ProfileClient() {
  const router = useRouter();
  const auth = useAuth();
  const { data: projects = [], isLoading, error } = useProjects();
  const createProject = useCreateProject();

  const [activeRole, setActiveRole] = useState<Role>((auth.role as Role) ?? "architect");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [inviteProject, setInviteProject] = useState<ProjectListItem | null>(null);

  async function handleSignOut() {
    await logout(); 
    router.push("/login");
  }

  // Navigate to first subproject if available, else to main project shell
  async function handleProjectClick(project: ProjectListItem) {
    try {
      const res = await authFetch(`${API}/projects/${project.id}`);
      if (res.ok) {
        const detail = await res.json() as ProjectDetail;
        if (detail.subprojects.length > 0) {
          const first = detail.subprojects[0]!;
          router.push(`/th/workspace/${first.id}/${first.id}`);
          return;
        }
      }
    } catch {
      // fall through to main project shell
    }
    router.push(`/th/workspace/${project.id}/${project.id}`);
  }

  async function handleCreate(name: string, description: string) {
    await createProject.mutateAsync({ name, description: description || undefined });
  }

  const isActiveRole = activeRole === auth.role;
  const displayProjects = isActiveRole ? projects : [];

  return (
    <div className="profile-wrap">

      {createModalOpen && (
        <CreateProjectModal
          onClose={() => setCreateModalOpen(false)}
          onCreate={handleCreate}
        />
      )}

      {inviteProject && (
        <InviteModal
          projectId={inviteProject.id}
          projectName={inviteProject.name}
          onClose={() => setInviteProject(null)}
        />
      )}

      {/* ── Header ── */}
      <div className="profile-header">
        <div className="profile-topbar">
          <div className="profile-wordmark">House<span>Mind</span></div>
          <button className="profile-signout" onClick={handleSignOut}>ออกจากระบบ</button>
        </div>

        <div className="profile-user-row">
          <div className="profile-avatar">
            {auth.user?.email?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div>
            <div className="profile-user-name">{auth.user?.email?.split("@")[0] ?? "Loading…"}</div>
            <div className="profile-user-email">{auth.user?.email ?? ""}</div>
          </div>
        </div>

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

        {isLoading && isActiveRole && (
          <div className="profile-loading">
            {[1, 2, 3].map((n) => <div key={n} className="profile-skeleton" />)}
          </div>
        )}

        {error && isActiveRole && (
          <div style={{ padding: 16, background: "#FEF2F2", border: "0.5px solid #FECACA", borderRadius: 12, fontSize: 12, color: "#E24B4A" }}>
            Could not load projects. Check your connection.
          </div>
        )}

        {!isLoading && isActiveRole && displayProjects.length > 0 && (
          <>
            <div className="profile-project-list">
              {displayProjects.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  onClick={() => handleProjectClick(p)}
                  onInvite={() => setInviteProject(p)}
                  isArchitect={auth.role === "architect"}
                />
              ))}
            </div>
            {auth.role === "architect" && (
              <button className="profile-new-btn" onClick={() => setCreateModalOpen(true)}>
                <span style={{ fontSize: 16 }}>+</span>
                สร้างโครงการใหม่ · New Project
              </button>
            )}
          </>
        )}

        {!isLoading && isActiveRole && displayProjects.length === 0 && !error && (
          <div className="profile-empty">
            <div className="profile-empty-icon">{ROLE_META[activeRole].icon}</div>
            <div className="profile-empty-title">
              {activeRole === "architect" ? "ยังไม่มีโครงการ" : "ยังไม่มีโครงการที่เข้าร่วม"}
            </div>
            <div className="profile-empty-sub">
              {activeRole === "architect"
                ? "Create your first project to get started."
                : "You'll appear here once an architect adds you to a project."}
            </div>
            {activeRole === "architect" && (
              <button className="profile-new-btn" onClick={() => setCreateModalOpen(true)}>
                <span style={{ fontSize: 16 }}>+</span>สร้างโครงการแรก
              </button>
            )}
          </div>
        )}

        {!isActiveRole && (
          <div className="profile-empty">
            <div className="profile-empty-icon">{ROLE_META[activeRole].icon}</div>
            <div className="profile-empty-title">{ROLE_META[activeRole].th}</div>
            <div className="profile-empty-sub">
              {`Your account is a ${auth.role ?? "unknown"} account.`}<br />
              Multi-role access coming soon.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}