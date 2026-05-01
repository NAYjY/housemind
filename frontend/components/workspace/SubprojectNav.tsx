// components/workspace/SubprojectNav.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useProjectDetail, useCreateSubProject } from "@/hooks/useProjects";
import styles from "./WorkspaceShell.module.css";

interface SubprojectNavProps {
  projectId: string;
  isShell: boolean;
}

export function SubprojectNav({ projectId, isShell }: SubprojectNavProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

  const { data: currentProject } = useProjectDetail(projectId);
  const parentId = isShell ? projectId : (currentProject?.parent_project_id ?? null);
  const { data: parentDetail, refetch: refetchParent } = useProjectDetail(parentId ?? "");
  const createSub = useCreateSubProject(parentId ?? "");
  const subprojects = parentDetail?.subprojects ?? [];
  const parentName = parentDetail?.name ?? "";
  const currentLabel = isShell ? (parentDetail?.name ?? "…") : (currentProject?.name ?? "…");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setFormError("");
    try {
      const created = await createSub.mutateAsync({
        name: newName.trim(),
        description: newDesc.trim() || undefined,
      });
      await refetchParent();
      setNewName(""); setNewDesc(""); setShowAddForm(false); setOpen(false);
      router.push(`/th/workspace/${created.id}/${created.id}`);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to create");
    } finally { setCreating(false); }
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => { setOpen((v) => !v); setShowAddForm(false); }}
        className={styles.subnavTrigger}
      >
        <div>
          {!isShell && <div className={styles.subnavParentLabel}>{parentName}</div>}
          <div className={styles.subnavCurrentLabel}>
            {currentLabel}
            <svg
              width="10" height="6" viewBox="0 0 10 6" fill="none"
              style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }}
            >
              <path d="M1 1l4 4 4-4" stroke="#888780" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </button>

      {open && (
        <>
          <div className={styles.subnavBackdrop} onClick={() => { setOpen(false); setShowAddForm(false); }} />
          <div className={styles.subnavDropdown}>
            <div className={styles.subnavDropdownHeader}>{parentName} · โครงการย่อย</div>

            {subprojects.length === 0 && (
              <div className={styles.subnavEmpty}>ยังไม่มีโครงการย่อย</div>
            )}

            {subprojects.map((sub) => {
              const isCurrent = sub.id === projectId;
              return (
                <button
                  key={sub.id}
                  onClick={() => { setOpen(false); if (!isCurrent) router.push(`/th/workspace/${sub.id}/${sub.id}`); }}
                  className={`${styles.subnavItem} ${isCurrent ? styles.active : ""}`}
                >
                  <div className={styles.subnavItemIcon}>
                    {sub.name[0]?.toUpperCase() ?? "S"}
                  </div>
                  <div className={styles.subnavItemName}>{sub.name}</div>
                  {isCurrent && <span style={{ fontSize: 11, color: "#C49A3C", flexShrink: 0 }}>✓</span>}
                </button>
              );
            })}

            {!showAddForm ? (
              <button onClick={() => setShowAddForm(true)} className={styles.subnavAddBtn}>
                <span className={styles.subnavAddIcon}>+</span>
                เพิ่มโครงการย่อย
              </button>
            ) : (
              <form onSubmit={handleCreate} className={styles.subnavForm}>
                <div className={styles.subnavFormLabel}>ชื่อโครงการย่อย *</div>
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="เช่น ห้องนอน, ห้องน้ำ"
                  className={styles.subnavFormInput}
                />
                <input
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="รายละเอียด (optional)"
                  className={styles.subnavFormInput}
                />
                {formError && <div className={styles.subnavFormError}>{formError}</div>}
                <div className={styles.subnavFormActions}>
                  <button
                    type="button"
                    onClick={() => { setShowAddForm(false); setNewName(""); setNewDesc(""); setFormError(""); }}
                    className={styles.subnavFormCancel}
                  >ยกเลิก</button>
                  <button
                    type="submit"
                    disabled={creating || !newName.trim()}
                    className={styles.subnavFormSubmit}
                  >{creating ? "กำลังสร้าง…" : "สร้าง"}</button>
                </div>
              </form>
            )}
          </div>
        </>
      )}
    </div>
  );
}