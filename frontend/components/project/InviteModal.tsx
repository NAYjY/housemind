"use client";

/**
 * components/project/InviteModal.tsx — HouseMind
 *
 * Architect searches registered users by email/name and adds them to a project.
 *
 * Flow:
 *   1. User has already registered at /register
 *   2. Architect types email → live search hits GET /v1/users/search
 *   3. Architect picks a user + role → POST /v1/invites
 *   4. User is added to project_members immediately
 *   5. Next time user logs in, the project appears in their profile
 */


import { useState, useEffect, useRef } from "react";
import { authFetch } from "@/lib/auth";

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
      className="hm-invite-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="hm-invite-sheet">

        {/* Header */}
        <div className="hm-invite-header">
          <div>
            <div className="hm-invite-header-title">เพิ่มผู้ร่วมงาน</div>
            <div className="hm-invite-header-sub">Add member to "{projectName}"</div>
          </div>
          <button onClick={onClose} className="hm-close-btn">×</button>
        </div>

        {/* Body */}
        <div className="hm-invite-body">

          {/* Added this session */}
          {added.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div className="hm-invite-added-label">เพิ่มแล้ว · Added</div>
              {added.map((u) => (
                <div key={u.id} className="hm-invite-added-row">
                  <UserAvatar name={u.full_name} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="hm-invite-added-name">{u.full_name}</div>
                    <div className="hm-invite-added-email">{u.email}</div>
                  </div>
                  <span style={{ fontSize: 14 }}>✓</span>
                </div>
              ))}
              <div className="hm-invite-divider" />
            </div>
          )}

          {/* Search */}
          <div className="hm-invite-section-label">ค้นหาผู้ใช้ · Search by email or name</div>
          <div className="hm-invite-search-wrap">
            <input
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSelected(null); setError(""); }}
              placeholder="พิมพ์ email หรือชื่อ... (อย่างน้อย 2 ตัวอักษร)"
              autoFocus
              className="hm-invite-search-input"
            />
            {searching && <div className="hm-invite-search-spinner" />}
            {query && !searching && (
              <button
                onClick={() => { setQuery(""); setResults([]); setSelected(null); }}
                className="hm-invite-search-clear"
              >×</button>
            )}
          </div>

          {query.trim().length < 2 && query.length > 0 && (
            <div className="hm-invite-hint">
              พิมพ์อีก {2 - query.trim().length} ตัวเพื่อค้นหา
            </div>
          )}

          {/* Results */}
          {results.length > 0 && !selected && (
            <div style={{ marginBottom: 12 }}>
              {results.map((u) => (
                <button
                  key={u.id}
                  onClick={() => { setSelected(u); setResults([]); }}
                  className="hm-invite-result-btn"
                >
                  <UserAvatar name={u.full_name} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="hm-invite-result-name">{u.full_name}</div>
                    <div className="hm-invite-result-email">{u.email}</div>
                  </div>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>
                    {ROLE_ICONS[u.role] ?? "👤"}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* No results */}
          {query.trim().length >= 2 && !searching && results.length === 0 && !selected && (
            <div className="hm-invite-empty">
              <div className="hm-invite-empty-icon">🔍</div>
              <div className="hm-invite-empty-text">
                ไม่พบผู้ใช้ที่ตรงกัน<br />
                <span className="hm-invite-empty-sub">
                  ผู้ใช้ต้องสมัครบัญชีก่อนจึงจะเพิ่มได้<br />
                  They need to register at /register first.
                </span>
              </div>
            </div>
          )}

          {/* Selected + role picker */}
          {selected && (
            <div>
              <div className="hm-invite-selected-card">
                <UserAvatar name={selected.full_name} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="hm-invite-selected-name">{selected.full_name}</div>
                  <div className="hm-invite-selected-email">{selected.email}</div>
                </div>
                <button
                  onClick={() => { setSelected(null); setQuery(""); setResults([]); setError(""); }}
                  className="hm-invite-selected-clear"
                >×</button>
              </div>

              <div className="hm-invite-role-label">บทบาทในโครงการนี้ · Role in this project</div>
              <div className="hm-invite-role-list">
                {ROLES.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRole(r.value)}
                    className={`hm-invite-role-btn ${role === r.value ? "selected" : ""}`}
                  >
                    <span style={{ fontSize: 20, flexShrink: 0 }}>{r.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div className="hm-invite-role-name">
                        {r.label}
                        <span className="hm-invite-role-name-en">{r.labelEn}</span>
                      </div>
                      <div className="hm-invite-role-desc">{r.desc}</div>
                    </div>
                    {role === r.value && <div className="hm-invite-role-check">✓</div>}
                  </button>
                ))}
              </div>

              {error && <div className="hm-invite-error">{error}</div>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="hm-invite-footer">
          {selected ? (
            <button
              onClick={handleAdd}
              disabled={adding}
              className="hm-invite-submit-btn"
            >
              {adding
                ? <><div className="hm-invite-submit-spinner" />กำลังเพิ่ม…</>
                : `เพิ่ม ${selected.full_name.split(" ")[0]} เป็น ${selectedRoleDef.label} ${selectedRoleDef.icon}`
              }
            </button>
          ) : (
            <button
              onClick={onClose}
              className={`hm-invite-close-btn ${added.length > 0 ? "done" : ""}`}
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
      className="hm-avatar"
      style={{
        width: size,
        height: size,
        background: color,
        fontSize: size * 0.42,
      }}
    >
      {initial}
    </div>
  );
}