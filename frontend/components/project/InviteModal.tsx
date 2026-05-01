"use client";

import { useState, useEffect, useRef } from "react";
import { authFetch } from "@/lib/auth";
import styles from "./InviteModal.module.css";
import closeBtnStyles from "@/components/shared/CloseBtn.module.css";

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

const ROLES = [
  { value: "contractor", label: "ผู้รับเหมา",     labelEn: "Contractor", desc: "View & resolve annotations", icon: "🔨" },
  { value: "homeowner",  label: "เจ้าของบ้าน",   labelEn: "Homeowner",  desc: "Read-only, approve decisions", icon: "🏠" },
  { value: "supplier",   label: "ผู้จัดจำหน่าย", labelEn: "Supplier",   desc: "Manage product catalogue", icon: "📦" },
] as const;

type InviteRole = typeof ROLES[number]["value"];

interface UserResult {
  id: string;
  email: string;
  full_name: string;
  role: string;
}

interface Props {
  projectId: string;
  projectName: string;
  onClose: () => void;
}

const ROLE_ICONS: Record<string, string> = {
  architect: "✏️", contractor: "🔨", homeowner: "🏠", supplier: "📦",
};

export function InviteModal({ projectId, projectName, onClose }: Props) {
  const [query,     setQuery]     = useState("");
  const [results,   setResults]   = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected,  setSelected]  = useState<UserResult | null>(null);
  const [role,      setRole]      = useState<InviteRole>("contractor");
  const [adding,    setAdding]    = useState(false);
  const [error,     setError]     = useState("");
  const [added,     setAdded]     = useState<UserResult[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await authFetch(
          `${API}/users/search?q=${encodeURIComponent(query.trim())}&project_id=${projectId}`
        );
        if (res.ok) {
          const data: UserResult[] = await res.json();
          const addedIds = new Set(added.map((u) => u.id));
          setResults(data.filter((u) => !addedIds.has(u.id)));
        }
      } catch { /* silent */ } finally { setSearching(false); }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, projectId, added]);

  async function handleAdd() {
    if (!selected) return;
    setAdding(true);
    setError("");
    try {
      const res = await authFetch(`${API}/invites`, {
        method: "POST",
        body: JSON.stringify({ project_id: projectId, user_id: selected.id, role }),
      });
      if (res.status === 409) { setError("User is already a member of this project"); return; }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? `Error ${res.status}`);
      }
      setAdded((prev) => [...prev, selected]);
      setResults((prev) => prev.filter((u) => u.id !== selected.id));
      setSelected(null);
      setQuery("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add member");
    } finally { setAdding(false); }
  }

  const selectedRoleDef = ROLES.find((r) => r.value === role)!;

  return (
    <div
      className={styles.overlay}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={styles.sheet}>

        <div className={styles.header}>
          <div>
            <div className={styles.headerTitle}>เพิ่มผู้ร่วมงาน</div>
            <div className={styles.headerSub}>Add member to "{projectName}"</div>
          </div>
          <button onClick={onClose} className={closeBtnStyles.closeBtn}>×</button>
        </div>

        <div className={styles.body}>

          {added.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div className={styles.addedLabel}>เพิ่มแล้ว · Added</div>
              {added.map((u) => (
                <div key={u.id} className={styles.addedRow}>
                  <UserAvatar name={u.full_name} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className={styles.addedName}>{u.full_name}</div>
                    <div className={styles.addedEmail}>{u.email}</div>
                  </div>
                  <span style={{ fontSize: 14 }}>✓</span>
                </div>
              ))}
              <div className={styles.divider} />
            </div>
          )}

          <div className={styles.sectionLabel}>ค้นหาผู้ใช้ · Search by email or name</div>
          <div className={styles.searchWrap}>
            <input
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSelected(null); setError(""); }}
              placeholder="พิมพ์ email หรือชื่อ... (อย่างน้อย 2 ตัวอักษร)"
              autoFocus
              className={styles.searchInput}
            />
            {searching && <div className={styles.searchSpinner} />}
            {query && !searching && (
              <button
                onClick={() => { setQuery(""); setResults([]); setSelected(null); }}
                className={styles.searchClear}
              >×</button>
            )}
          </div>

          {query.trim().length < 2 && query.length > 0 && (
            <div className={styles.hint}>
              พิมพ์อีก {2 - query.trim().length} ตัวเพื่อค้นหา
            </div>
          )}

          {results.length > 0 && !selected && (
            <div style={{ marginBottom: 12 }}>
              {results.map((u) => (
                <button
                  key={u.id}
                  onClick={() => { setSelected(u); setResults([]); }}
                  className={styles.resultBtn}
                >
                  <UserAvatar name={u.full_name} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className={styles.resultName}>{u.full_name}</div>
                    <div className={styles.resultEmail}>{u.email}</div>
                  </div>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>
                    {ROLE_ICONS[u.role] ?? "👤"}
                  </span>
                </button>
              ))}
            </div>
          )}

          {query.trim().length >= 2 && !searching && results.length === 0 && !selected && (
            <div className={styles.emptyWrap}>
              <div className={styles.emptyIcon}>🔍</div>
              <div className={styles.emptyText}>
                ไม่พบผู้ใช้ที่ตรงกัน<br />
                <span className={styles.emptySub}>
                  ผู้ใช้ต้องสมัครบัญชีก่อนจึงจะเพิ่มได้<br />
                  They need to register at /register first.
                </span>
              </div>
            </div>
          )}

          {selected && (
            <div>
              <div className={styles.selectedCard}>
                <UserAvatar name={selected.full_name} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className={styles.selectedName}>{selected.full_name}</div>
                  <div className={styles.selectedEmail}>{selected.email}</div>
                </div>
                <button
                  onClick={() => { setSelected(null); setQuery(""); setResults([]); setError(""); }}
                  className={styles.selectedClear}
                >×</button>
              </div>

              <div className={styles.roleLabel}>บทบาทในโครงการนี้ · Role in this project</div>
              <div className={styles.roleList}>
                {ROLES.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRole(r.value)}
                    className={`${styles.roleBtn} ${role === r.value ? styles.selected : ""}`}
                  >
                    <span style={{ fontSize: 20, flexShrink: 0 }}>{r.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div className={styles.roleName}>
                        {r.label}
                        <span className={styles.roleNameEn}>{r.labelEn}</span>
                      </div>
                      <div className={styles.roleDesc}>{r.desc}</div>
                    </div>
                    {role === r.value && <div className={styles.roleCheck}>✓</div>}
                  </button>
                ))}
              </div>

              {error && <div className={styles.error}>{error}</div>}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          {selected ? (
            <button
              onClick={handleAdd}
              disabled={adding}
              className={styles.submitBtn}
            >
              {adding
                ? <><div className={styles.submitSpinner} />กำลังเพิ่ม…</>
                : `เพิ่ม ${selected.full_name.split(" ")[0]} เป็น ${selectedRoleDef.label} ${selectedRoleDef.icon}`
              }
            </button>
          ) : (
            <button
              onClick={onClose}
              className={`${styles.closeBtn} ${added.length > 0 ? styles.done : ""}`}
            >
              {added.length > 0 ? `เสร็จสิ้น · Done (${added.length} added)` : "ปิด · Close"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function UserAvatar({ name, size }: { name: string; size: number }) {
  const initial = name.trim()[0]?.toUpperCase() ?? "?";
  const colors = ["#7F77DD", "#C49A3C", "#639922", "#E24B4A", "#534AB7", "#8B6520"];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <div
      className={styles.avatar}
      style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}
    >
      {initial}
    </div>
  );
}