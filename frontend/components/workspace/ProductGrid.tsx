// components/workspace/ProductGrid.tsx
"use client";

import type { Annotation } from "@/store/annotationStore";
import type { ProductDetail } from "@/hooks/useProducts";
import { useProjectProducts, useUnlinkProduct, useUnlinkProductByProductId } from "@/hooks/useProducts";
import { OBJECT_DEFS } from "./FanEmojiMenu";
import { useState } from "react";

interface Props {
  projectId: string;
  activeAnnotation: Annotation | null;
  showAll: boolean;
  canAttach: boolean;
  onShowAllToggle: () => void;
  onAttachProduct: () => void;
  onProductClick: (p: ProductDetail) => void;
}

export function ProductGrid({
  projectId,
  activeAnnotation,
  showAll,
  canAttach,
  onShowAllToggle,
  onAttachProduct,
  onProductClick,
}: Props) {
  const objectId = !showAll && activeAnnotation ? activeAnnotation.object_id : undefined;
  const def = activeAnnotation ? OBJECT_DEFS[activeAnnotation.object_id] : null;
  const { data: products = [], isLoading } = useProjectProducts(projectId, objectId);
  const unlinkMutation = useUnlinkProductByProductId(projectId);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  return (
    <div style={{ background: "#FAFAF8" }}>
      <div className="hm-section-header">
        <div>
          <div className="hm-section-title">
            {showAll
              ? "All Products"
              : activeAnnotation
                ? `${def?.emoji ?? ""} ${def?.label ?? "Products"}`
                : "Products"}
          </div>
          {activeAnnotation && !showAll && (
            <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
              {Math.round(activeAnnotation.position_x * 100)}%,{" "}
              {Math.round(activeAnnotation.position_y * 100)}%
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {canAttach && activeAnnotation && !showAll && (
            <button
              onClick={onAttachProduct}
              style={{
                fontSize: 11, color: "#fff", background: "#8B6520",
                border: "none", borderRadius: 8, padding: "5px 10px",
                cursor: "pointer", fontWeight: 500,
              }}
            >
              + Attach
            </button>
          )}
          <button
            onClick={onShowAllToggle}
            style={{
              fontSize: 11, color: "var(--color-accent, #8B6520)",
              background: "none", border: "none", cursor: "pointer",
            }}
          >
            {showAll ? "Filter by pin" : "Show all"}
          </button>
        </div>
      </div>

      {isLoading && (
        <div style={{ padding: 32, textAlign: "center" }}>
          <div className="spinner" />
        </div>
      )}

      {!isLoading && products.length === 0 && (
        <div style={{ padding: "40px 20px", textAlign: "center", color: "#888", fontSize: 13 }}>
          {activeAnnotation && !showAll
            ? "No products for this pin yet — tap Attach"
            : "No products in this project yet"}
        </div>
      )}

      {!isLoading && products.length > 0 && (
        <div className="hm-product-grid">
          {products.map((p) => (
            <div
              key={p.id}
              className="hm-prod-card"
              onClick={() => onProductClick(p)}
              style={{ cursor: "pointer", position: "relative" }}
            >
              {canAttach && !showAll && activeAnnotation && (
                <button
                  onClick={async (e) => {
                      e.stopPropagation();
                      if (!activeAnnotation) return;
                      setUnlinkingId(p.id);
                      try {
                        await unlinkMutation.mutateAsync({
                          productId: p.id,
                          objectId: activeAnnotation.object_id,
                        });
                      } finally {
                        setUnlinkingId(null);
                      }
                    }}
                  disabled={unlinkingId === p.id}
                  style={{
                    position: "absolute", top: 6, right: 6, zIndex: 10,
                    width: 20, height: 20, borderRadius: "50%",
                    background: "rgba(226,75,74,0.9)", border: "none",
                    color: "#fff", fontSize: 11, fontWeight: 700,
                    cursor: "pointer", display: "flex", alignItems: "center",
                    justifyContent: "center", lineHeight: 1,
                    opacity: unlinkingId === p.id ? 0.5 : 1,
                  }}
                  title="Remove from project"
                >
                  ×
                </button>
              )}
              <div className="hm-prod-img">
                {p.thumbnail_url ? (
                  <img src={p.thumbnail_url} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div className="hm-prod-letter">{p.name[0]}</div>
                )}
              </div>
              <div className="hm-prod-title">{p.name}</div>
              {p.brand && <div className="hm-prod-tag">{p.brand}</div>}
              {p.price != null && (
                <div className="hm-prod-contact">฿{p.price.toLocaleString("th-TH")}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}