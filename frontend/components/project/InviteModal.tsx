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
  const [query,    setQuery]    = useState("");
  const [results,  setResults]  = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<UserResult | null>(null);
  const [role,     setRole]     = useState<InviteRole>("contractor");
  const [adding,   setAdding]   = useState(false);
  const [error,    setError]    = useState("");
  const [added,    setAdded]    = useState<UserResult[]>([]);  // track added this session

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live search as user types
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await authFetch(
          `${API}/users/search?q=${encodeURIComponent(query.trim())}&project_id=${projectId}`
        );
        if (res.ok) {
          const data: UserResult[] = await res.json();
          // Also filter out users added in this session
          const addedIds = new Set(added.map((u) => u.id));
          setResults(data.filter((u) => !addedIds.has(u.id)));
        }
      } catch {
        // silent — don't surface search errors
      } finally {
        setSearching(false);
      }
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
        body: JSON.stringify({
          project_id: projectId,
          user_id:    selected.id,
          role,
        }),
      });

      if (res.status === 409) {
        setError("User is already a member of this project");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? `Error ${res.status}`);
      }

      // Success — move to added list, clear selection
      setAdded((prev) => [...prev, selected]);
      setResults((prev) => prev.filter((u) => u.id !== selected.id));
      setSelected(null);
      setQuery("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setAdding(false);
    }
  }

  const selectedRoleDef = ROLES.find((r) => r.value === role)!;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 400,
        background: "rgba(28,24,16,0.55)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        backdropFilter: "blur(2px)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#FAF8F4",
        borderRadius: "20px 20px 0 0",
        width: "100%", maxWidth: 430,
        maxHeight: "90vh",
        display: "flex", flexDirection: "column",
        boxShadow: "0 -8px 40px rgba(0,0,0,0.18)",
        animation: "hm-slide-up 0.22s cubic-bezier(0.32,0.72,0,1)",
      }}>

        {/* ── Header ── */}
        <div style={{
          padding: "20px 20px 16px",
          borderBottom: "0.5px solid #E8E6E0",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1A1A18" }}>
              เพิ่มผู้ร่วมงาน
            </div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
              Add member to "{projectName}"
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: "50%", background: "#F5F4F0", border: "none", fontSize: 18, color: "#888", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            ×
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 0" }}>

          {/* Added this session */}
          {added.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#639922", marginBottom: 8 }}>
                เพิ่มแล้ว · Added
              </div>
              {added.map((u) => (
                <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "#EAF3DE", borderRadius: 10, marginBottom: 6 }}>
                  <UserAvatar name={u.full_name} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#1A1A18", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.full_name}</div>
                    <div style={{ fontSize: 11, color: "#639922" }}>{u.email}</div>
                  </div>
                  <span style={{ fontSize: 14 }}>✓</span>
                </div>
              ))}
              <div style={{ height: 12, borderBottom: "0.5px solid #E8E6E0", marginBottom: 16 }} />
            </div>
          )}

          {/* Search */}
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#888", marginBottom: 6 }}>
            ค้นหาผู้ใช้ · Search by email or name
          </div>
          <div style={{ position: "relative", marginBottom: 12 }}>
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(null);
                setError("");
              }}
              placeholder="พิมพ์ email หรือชื่อ... (อย่างน้อย 2 ตัวอักษร)"
              autoFocus
              style={{
                width: "100%", height: 44,
                border: "0.5px solid #E8E6E0", borderRadius: 12,
                padding: "0 40px 0 14px", fontSize: 13,
                fontFamily: "inherit", background: "#fff",
                outline: "none", boxSizing: "border-box", color: "#1A1A18",
              }}
            />
            {searching && (
              <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, border: "2px solid rgba(139,101,32,0.2)", borderTop: "2px solid #C49A3C", borderRadius: "50%", animation: "hm-spin 0.7s linear infinite" }} />
            )}
            {query && !searching && (
              <button
                onClick={() => { setQuery(""); setResults([]); setSelected(null); }}
                style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", fontSize: 16, color: "#bbb", cursor: "pointer", lineHeight: 1 }}
              >
                ×
              </button>
            )}
          </div>

          {/* Search hint */}
          {query.trim().length < 2 && query.length > 0 && (
            <div style={{ fontSize: 11, color: "#B0A090", marginBottom: 12 }}>
              พิมพ์อีก {2 - query.trim().length} ตัวเพื่อค้นหา
            </div>
          )}

          {/* Results list */}
          {results.length > 0 && !selected && (
            <div style={{ marginBottom: 12 }}>
              {results.map((u) => (
                <button
                  key={u.id}
                  onClick={() => { setSelected(u); setResults([]); }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 12px", marginBottom: 6,
                    background: "#fff", border: "0.5px solid #E8E6E0", borderRadius: 12,
                    cursor: "pointer", textAlign: "left",
                    transition: "border-color 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#C49A3C")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#E8E6E0")}
                >
                  <UserAvatar name={u.full_name} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A18", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {u.full_name}
                    </div>
                    <div style={{ fontSize: 11, color: "#888", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {u.email}
                    </div>
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
            <div style={{ padding: "20px 0", textAlign: "center" }}>
              <div style={{ fontSize: 22, marginBottom: 8 }}>🔍</div>
              <div style={{ fontSize: 13, color: "#888", lineHeight: 1.6 }}>
                ไม่พบผู้ใช้ที่ตรงกัน<br />
                <span style={{ fontSize: 11, color: "#B0A090" }}>
                  ผู้ใช้ต้องสมัครบัญชีก่อนจึงจะเพิ่มได้<br />
                  They need to register at /register first.
                </span>
              </div>
            </div>
          )}

          {/* Selected user + role picker */}
          {selected && (
            <div>
              {/* Selected user card */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "#FEF3DC", border: "1.5px solid #C49A3C", borderRadius: 12, marginBottom: 16 }}>
                <UserAvatar name={selected.full_name} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1A18" }}>{selected.full_name}</div>
                  <div style={{ fontSize: 11, color: "#8B6010" }}>{selected.email}</div>
                </div>
                <button
                  onClick={() => { setSelected(null); setQuery(""); setResults([]); setError(""); }}
                  style={{ background: "none", border: "none", fontSize: 18, color: "#C49A3C", cursor: "pointer", flexShrink: 0 }}
                >
                  ×
                </button>
              </div>

              {/* Role picker */}
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#888", marginBottom: 10 }}>
                บทบาทในโครงการนี้ · Role in this project
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                {ROLES.map((r) => {
                  const isSelected = role === r.value;
                  return (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setRole(r.value)}
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "10px 14px",
                        border: `1.5px solid ${isSelected ? "#C49A3C" : "#E8E6E0"}`,
                        borderRadius: 12,
                        background: isSelected ? "#FEF3DC" : "#fff",
                        cursor: "pointer", textAlign: "left",
                        transition: "all 0.15s",
                      }}
                    >
                      <span style={{ fontSize: 20, flexShrink: 0 }}>{r.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: isSelected ? "#8B6010" : "#1A1A18" }}>
                          {r.label}
                          <span style={{ fontWeight: 400, color: "#888", marginLeft: 6 }}>{r.labelEn}</span>
                        </div>
                        <div style={{ fontSize: 11, color: "#888" }}>{r.desc}</div>
                      </div>
                      {isSelected && (
                        <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#C49A3C", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>✓</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {error && (
                <div style={{ fontSize: 12, color: "#E24B4A", marginBottom: 12, padding: "10px 12px", background: "#FEF2F2", borderRadius: 8, border: "0.5px solid #FECACA" }}>
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{ padding: "14px 20px 36px", borderTop: "0.5px solid #E8E6E0", flexShrink: 0 }}>
          {selected ? (
            <button
              onClick={handleAdd}
              disabled={adding}
              style={{
                width: "100%", height: 50,
                background: "#1A1A18", border: "none", borderRadius: 14,
                color: "#fff", fontSize: 14, fontWeight: 600,
                cursor: adding ? "not-allowed" : "pointer",
                opacity: adding ? 0.6 : 1,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              {adding ? (
                <><div style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid #fff", borderRadius: "50%", animation: "hm-spin 0.7s linear infinite" }} />กำลังเพิ่ม…</>
              ) : (
                `เพิ่ม ${selected.full_name.split(" ")[0]} เป็น ${selectedRoleDef.label} ${selectedRoleDef.icon}`
              )}
            </button>
          ) : (
            <button
              onClick={onClose}
              style={{ width: "100%", height: 50, background: added.length > 0 ? "#1A1A18" : "#F5F4F0", border: "0.5px solid #E8E6E0", borderRadius: 14, fontSize: 14, fontWeight: 500, cursor: "pointer", color: added.length > 0 ? "#fff" : "#888" }}
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
  const colors = ["#7F77DD","#C49A3C","#639922","#E24B4A","#534AB7","#8B6520"];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: color, flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#fff", fontSize: size * 0.42, fontWeight: 700,
      fontFamily: "'DM Serif Display', serif",
    }}>
      {initial}
    </div>
  );
}