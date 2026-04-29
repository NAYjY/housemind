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
            <button onClick={onAttachProduct} className="hm-grid-attach-btn">
              + Attach
            </button>
          )}
          <button onClick={onShowAllToggle} className="hm-grid-toggle-btn">
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
        <div className="hm-grid-empty">
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
                      } catch (err) {
                        console.error("Unlink failed:", err);
                        alert("Failed to unlink product");
                      } finally {
                        setUnlinkingId(null);
                      }
                    }}
                  disabled={unlinkingId === p.id}
                  className="hm-grid-unlink-btn"
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