"use client";

// components/annotation/ProductDetailPanel.tsx — HouseMind
// Full product detail + which pin it belongs to + resolve/reopen

import { type Annotation } from "@/store/annotationStore";
import { type ProductDetail } from "@/hooks/useProducts";
import { useResolveAnnotation, useReopenAnnotation } from "@/hooks/useAnnotations";

const OBJECT_DEFS: Record<number, { emoji: string; label: string }> = {
  101: { emoji: "😊", label: "Smile" },
  102: { emoji: "⭐", label: "Star" },
  103: { emoji: "❤️", label: "Heart" },
  104: { emoji: "📷", label: "Camera" },
  105: { emoji: "🌿", label: "Leaf" },
  106: { emoji: "🗺️", label: "Map" },
  107: { emoji: "💵", label: "Dollar" },
  108: { emoji: "🏷️", label: "Tag" },
};

interface Props {
  product: ProductDetail;
  annotation: Annotation | null;   // which pin this product was opened from
  imageId: string;
  canResolve: boolean;
  onClose: () => void;
}

export function ProductDetailPanel({
  product,
  annotation,
  imageId,
  canResolve,
  onClose,
}: Props) {
  const resolveMutation = useResolveAnnotation(imageId);
  const reopenMutation = useReopenAnnotation(imageId);
  const isResolved = !!annotation?.resolved_at;
  const isBusy = resolveMutation.isPending || reopenMutation.isPending;
  const def = annotation ? OBJECT_DEFS[annotation.object_id] : null;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#FAFAF8",
      zIndex: 150, display: "flex", flexDirection: "column",
      maxWidth: 430, margin: "0 auto",
      animation: "hm-slide-up 0.22s cubic-bezier(0.32,0.72,0,1)",
      overflowY: "auto",
    }}>
      {/* Header */}
      <div style={{
        padding: "16px 20px",
        borderBottom: "0.5px solid #E8E6E0",
        display: "flex", alignItems: "center", gap: 12,
        flexShrink: 0, position: "sticky", top: 0,
        background: "#FAFAF8", zIndex: 10,
      }}>
        <button
          onClick={onClose}
          style={{
            width: 32, height: 32, borderRadius: "50%",
            background: "#F5F4F0", border: "none", cursor: "pointer",
            fontSize: 18, color: "#888", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >←</button>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A18", flex: 1, minWidth: 0,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {product.name}
        </div>
      </div>

      {/* Thumbnail */}
      {product.thumbnail_url && (
        <div style={{
          width: "100%", aspectRatio: "4/3",
          background: "#F5F4F0", flexShrink: 0, overflow: "hidden",
        }}>
          <img
            src={product.thumbnail_url}
            alt={product.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
      )}

      <div style={{ padding: "20px 20px 100px" }}>

        {/* Product info */}
        <div style={{ fontSize: 22, fontWeight: 700, color: "#1A1A18", marginBottom: 4 }}>
          {product.name}
        </div>
        {product.brand && (
          <div style={{ fontSize: 13, color: "#888", marginBottom: 12 }}>
            {product.brand}{product.model ? ` · ${product.model}` : ""}
          </div>
        )}
        {product.price != null && (
          <div style={{
            display: "inline-block",
            background: "#F5EDD4", color: "#7A6020",
            fontSize: 20, fontWeight: 600,
            padding: "8px 16px", borderRadius: 10,
            marginBottom: 20,
          }}>
            ฿{product.price.toLocaleString("th-TH")} {product.currency}
          </div>
        )}

        {/* Description */}
        {product.description && (
          <div style={{
            fontSize: 13, color: "#5A4E40", lineHeight: 1.7,
            marginBottom: 20, padding: "12px 14px",
            background: "#F5F4F0", borderRadius: 10,
          }}>
            {product.description}
          </div>
        )}

        {/* Specs */}
        {product.specs && Object.keys(product.specs).length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
              textTransform: "uppercase", color: "#888", marginBottom: 8 }}>
              Specifications
            </div>
            {Object.entries(product.specs).map(([k, v]) => (
              <div key={k} style={{
                display: "flex", justifyContent: "space-between",
                padding: "8px 0", borderBottom: "0.5px solid #F5F4F0", fontSize: 13,
              }}>
                <span style={{ color: "#888" }}>{k}</span>
                <span style={{ color: "#1A1A18", fontWeight: 500 }}>{String(v)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Pin info — which annotation this product is linked from */}
        {annotation && def && (
          <div style={{
            marginBottom: 20, padding: "12px 14px",
            background: "#fff", border: "0.5px solid #E8E6E0",
            borderRadius: 12,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
              textTransform: "uppercase", color: "#888", marginBottom: 8 }}>
              Pinned at
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 22 }}>{def.emoji}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: "#1A1A18" }}>
                  {def.label}
                </div>
                <div style={{ fontSize: 11, color: "#888" }}>
                  {Math.round(annotation.position_x * 100)}%, {Math.round(annotation.position_y * 100)}%
                  {isResolved && (
                    <span style={{ color: "#639922", marginLeft: 8 }}>✓ Resolved</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Resolve / Reopen */}
        {canResolve && annotation && (
          <div>
            {isResolved ? (
              <button
                onClick={() => reopenMutation.mutate(annotation.id)}
                disabled={isBusy}
                style={{
                  width: "100%", height: 44, background: "#F5F4F0",
                  border: "0.5px solid #E8E6E0", borderRadius: 12,
                  fontSize: 13, fontWeight: 500, cursor: "pointer",
                  opacity: isBusy ? 0.5 : 1,
                }}
              >
                {isBusy ? "Processing…" : "↩ Reopen"}
              </button>
            ) : (
              <button
                onClick={() => resolveMutation.mutate(annotation.id)}
                disabled={isBusy}
                style={{
                  width: "100%", height: 44, background: "#EAF3DE",
                  border: "none", borderRadius: 12, color: "#3B6D11",
                  fontSize: 13, fontWeight: 500, cursor: "pointer",
                  opacity: isBusy ? 0.5 : 1,
                }}
              >
                {isBusy ? "Processing…" : "✓ Mark as resolved"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}