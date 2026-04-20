"use client";

// components/annotation/ProductDetailPanel.tsx — HouseMind

import { type Annotation } from "@/store/annotationStore";
import { useProjectProducts } from "@/hooks/useProducts";
import { useResolveAnnotation, useReopenAnnotation } from "@/hooks/useAnnotations";

// Object defs — keep in sync with WorkspaceShell
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
  annotation: Annotation;
  projectId: string;
  imageId: string;
  canAttach: boolean;
  canResolve: boolean;
  onClose: () => void;
  onAttachProduct: () => void;
}

export function ProductDetailPanel({
  annotation,
  projectId,
  imageId,
  canAttach,
  canResolve,
  onClose,
  onAttachProduct,
}: Props) {
  const { data: products = [], isLoading } = useProjectProducts(projectId, annotation.object_id);
  const resolveMutation = useResolveAnnotation(imageId);
  const reopenMutation = useReopenAnnotation(imageId);
  const isResolved = !!annotation.resolved_at;
  const isBusy = resolveMutation.isPending || reopenMutation.isPending;
  const def = OBJECT_DEFS[annotation.object_id];

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#FAFAF8",
      zIndex: 150, display: "flex", flexDirection: "column",
      maxWidth: 430, margin: "0 auto",
      animation: "hm-slide-up 0.22s cubic-bezier(0.32,0.72,0,1)",
    }}>
      {/* Header */}
      <div style={{
        padding: "16px 20px", borderBottom: "0.5px solid #E8E6E0",
        display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 22, marginBottom: 2 }}>{def?.emoji ?? "📍"}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A18" }}>
            {def?.label ?? "Annotation"}
          </div>
          <div style={{ fontSize: 11, color: "#888" }}>
            {Math.round(annotation.position_x * 100)}%, {Math.round(annotation.position_y * 100)}%
            {isResolved && <span style={{ color: "#639922", marginLeft: 8 }}>✓ Resolved</span>}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            width: 32, height: 32, borderRadius: "50%",
            background: "#F5F4F0", border: "none", cursor: "pointer",
            fontSize: 16, color: "#888",
          }}
        >×</button>
      </div>

      {/* Product list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 10 }}>
          Products in this project
        </div>

        {isLoading && <div style={{ padding: 20, textAlign: "center" }}><div className="spinner" /></div>}

        {!isLoading && products.length === 0 && (
          <div style={{ padding: "32px 0", textAlign: "center", color: "#bbb", fontSize: 13 }}>
            No products yet
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {products.map((p) => (
            <div key={p.id} style={{
              display: "flex", gap: 12, alignItems: "center",
              padding: "10px 12px", background: "#fff",
              border: "0.5px solid #E8E6E0", borderRadius: 12,
            }}>
              <div style={{
                width: 52, height: 52, borderRadius: 8, overflow: "hidden",
                background: "#F5F4F0", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {p.thumbnail_url
                  ? <img src={p.thumbnail_url} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <span style={{ fontSize: 20 }}>{p.name[0]}</span>
                }
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "#1A1A18", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {p.name}
                </div>
                {p.brand && <div style={{ fontSize: 11, color: "#888" }}>{p.brand}{p.model ? ` · ${p.model}` : ""}</div>}
                {p.price != null && (
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#8B6520", marginTop: 2 }}>
                    ฿{p.price.toLocaleString("th-TH")}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {canAttach && (
          <button
            onClick={onAttachProduct}
            style={{
              width: "100%", marginTop: 14, height: 40,
              background: "#F5EDD8", border: "0.5px solid #C49A3C",
              borderRadius: 10, color: "#8B6520", fontSize: 13,
              fontWeight: 500, cursor: "pointer",
            }}
          >
            + Attach Product
          </button>
        )}
      </div>

      {/* Resolve footer */}
      {canResolve && (
        <div style={{ padding: "12px 16px", borderTop: "0.5px solid #E8E6E0", flexShrink: 0 }}>
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
  );
}