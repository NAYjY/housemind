"use client";

// components/annotation/ProductPickerModal.tsx — HouseMind

import { useState } from "react";
import { useProductSearch } from "@/hooks/useProducts";

interface Props {
  projectId: string;
  onSelect: (productId: string) => void;
  onClose: () => void;
}

export function ProductPickerModal({ projectId, onSelect, onClose }: Props) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const { data, isLoading } = useProductSearch(q, projectId);
  const products = data?.items ?? [];

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 300,
      background: "rgba(0,0,0,0.45)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }}>
      <div style={{
        background: "#FAFAF8", borderRadius: "20px 20px 0 0",
        width: "100%", maxWidth: 430, maxHeight: "80vh",
        display: "flex", flexDirection: "column",
        animation: "hm-slide-up 0.22s cubic-bezier(0.32,0.72,0,1)",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px 12px",
          borderBottom: "0.5px solid #E8E6E0",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A18" }}>
            Attach Product
          </div>
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: "50%",
            background: "#F5F4F0", border: "none", cursor: "pointer",
            fontSize: 16, color: "#888",
          }}>×</button>
        </div>

        {/* Search */}
        <div style={{ padding: "12px 16px", flexShrink: 0 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products…"
            style={{
              width: "100%", height: 40, borderRadius: 10,
              border: "0.5px solid #E8E6E0", padding: "0 14px",
              fontSize: 13, fontFamily: "inherit", outline: "none",
              background: "#fff",
            }}
          />
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px" }}>
          {isLoading && (
            <div style={{ padding: 24, textAlign: "center" }}>
              <div className="spinner" />
            </div>
          )}
          {!isLoading && products.length === 0 && (
            <div style={{ padding: "32px 0", textAlign: "center", color: "#bbb", fontSize: 13 }}>
              {q ? "No products found" : "Start typing to search"}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {products.map((p) => {
              const isSelected = selected === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => setSelected(p.id)}
                  style={{
                    display: "flex", gap: 12, alignItems: "center",
                    padding: "10px 12px",
                    background: isSelected ? "#F5EDD8" : "#fff",
                    border: `0.5px solid ${isSelected ? "#C49A3C" : "#E8E6E0"}`,
                    borderRadius: 12, cursor: "pointer",
                    transition: "border-color 0.15s, background 0.15s",
                  }}
                >
                  <div style={{
                    width: 48, height: 48, borderRadius: 8,
                    background: "#F5F4F0", flexShrink: 0,
                    overflow: "hidden", display: "flex",
                    alignItems: "center", justifyContent: "center",
                  }}>
                    {p.thumbnail_url
                      ? <img src={p.thumbnail_url} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <span style={{ fontSize: 18 }}>{p.name[0]}</span>
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#1A1A18", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {p.name}
                    </div>
                    {p.brand && <div style={{ fontSize: 11, color: "#888" }}>{p.brand}</div>}
                    {p.price != null && (
                      <div style={{ fontSize: 12, color: "#8B6520", fontWeight: 600 }}>
                        ฿{p.price.toLocaleString("th-TH")}
                      </div>
                    )}
                  </div>
                  {isSelected && <span style={{ color: "#C49A3C", fontSize: 18 }}>✓</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Confirm */}
        <div style={{ padding: "12px 16px 24px", borderTop: "0.5px solid #E8E6E0", flexShrink: 0 }}>
          <button
            onClick={() => { if (selected) onSelect(selected); }}
            disabled={!selected}
            style={{
              width: "100%", height: 44,
              background: selected ? "#1A1A18" : "#E8E6E0",
              border: "none", borderRadius: 12,
              color: selected ? "#fff" : "#aaa",
              fontSize: 13, fontWeight: 500,
              cursor: selected ? "pointer" : "not-allowed",
              transition: "background 0.15s",
            }}
          >
            Attach to Project
          </button>
        </div>
      </div>
    </div>
  );
}