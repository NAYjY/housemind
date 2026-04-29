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
    <div className="hm-picker-overlay">
      <div className="hm-picker-sheet">
        {/* Header */}
        <div className="hm-picker-header">
          <div className="hm-picker-title">Attach Product</div>
          <button onClick={onClose} className="hm-close-btn">×</button>
        </div>

        {/* Search */}
        <div className="hm-picker-search-wrap">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products…"
            className="hm-picker-input"
          />
        </div>

        {/* Results */}
        <div className="hm-picker-results">
          {isLoading && (
            <div style={{ padding: 24, textAlign: "center" }}>
              <div className="spinner" />
            </div>
          )}
          {!isLoading && products.length === 0 && (
            <div className="hm-picker-empty">
              {q ? "No products found" : "Start typing to search"}
            </div>
          )}
          <div className="hm-picker-list">
            {products.map((p) => {
              const isSelected = selected === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => setSelected(p.id)}
                  className={`hm-picker-item ${isSelected ? "selected" : ""}`}
                >
                  <div className="hm-picker-thumb">
                    {p.thumbnail_url
                      ? <img src={p.thumbnail_url} alt={p.name} />
                      : <span style={{ fontSize: 18 }}>{p.name[0]}</span>
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="hm-picker-item-name">{p.name}</div>
                    {p.brand && <div className="hm-picker-item-brand">{p.brand}</div>}
                    {p.price != null && (
                      <div className="hm-picker-item-price">
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
        <div className="hm-picker-footer">
          <button
            onClick={() => { if (selected) onSelect(selected); }}
            disabled={!selected}
            className={`hm-picker-confirm ${selected ? "active" : "inactive"}`}
          >
            Attach to Project
          </button>
        </div>
      </div>
    </div>
  );
}