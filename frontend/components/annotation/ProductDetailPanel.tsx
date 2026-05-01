"use client";

import { type Annotation } from "@/store/annotationStore";
import { type ProductDetail } from "@/hooks/useProducts";
import { useResolveAnnotation, useReopenAnnotation } from "@/hooks/useAnnotations";
import { OBJECT_DEFS } from  "@/components/workspace/FanEmojiMenu";

interface Props {
  product: ProductDetail;
  annotation: Annotation | null;
  imageId: string;
  canResolve: boolean;
  onClose: () => void;
}

export function ProductDetailPanel({ product, annotation, imageId, canResolve, onClose }: Props) {
  const resolveMutation = useResolveAnnotation(imageId);
  const reopenMutation = useReopenAnnotation(imageId);
  const isResolved = !!annotation?.resolved_at;
  const isBusy = resolveMutation.isPending || reopenMutation.isPending;
  const def = annotation ? OBJECT_DEFS[annotation.object_id] : null;

  return (
    <div className="hm-pdp-wrap">
      {/* Header */}
      <div className="hm-pdp-header">
        <button onClick={onClose} className="hm-close-btn">←</button>
        <div className="hm-pdp-title">{product.name}</div>
      </div>

      {/* Thumbnail */}
      {product.thumbnail_url && (
        <div className="hm-pdp-thumb-wrap">
          <img src={product.thumbnail_url} alt={product.name} className="hm-pdp-thumb" />
        </div>
      )}

      <div className="hm-pdp-body">
        <div className="hm-pdp-name">{product.name}</div>

        {product.brand && (
          <div className="hm-pdp-brand">
            {product.brand}{product.model ? ` · ${product.model}` : ""}
          </div>
        )}

        {product.price != null && (
          <div className="hm-pdp-price">
            ฿{product.price.toLocaleString("th-TH")} {product.currency}
          </div>
        )}

        {product.description && (
          <div className="hm-pdp-desc">{product.description}</div>
        )}

        {product.specs && Object.keys(product.specs).length > 0 && (
          <div className="hm-pdp-specs">
            <div className="hm-pdp-specs-label">Specifications</div>
            {Object.entries(product.specs).map(([k, v]) => (
              <div key={k} className="hm-pdp-spec-row">
                <span className="hm-pdp-spec-key">{k}</span>
                <span className="hm-pdp-spec-val">{String(v)}</span>
              </div>
            ))}
          </div>
        )}

        {annotation && def && (
          <div className="hm-pdp-pin-box">
            <div className="hm-pdp-pin-label">Pinned at</div>
            <div className="hm-pdp-pin-row">
              <span className="hm-pdp-pin-emoji">{def.emoji}</span>
              <div>
                <div className="hm-pdp-pin-name">{def.label}</div>
                <div className="hm-pdp-pin-meta">
                  {Math.round(annotation.position_x * 100)}%, {Math.round(annotation.position_y * 100)}%
                  {isResolved && <span className="hm-pdp-resolved-tag">✓ Resolved</span>}
                </div>
              </div>
            </div>
          </div>
        )}

        {canResolve && annotation && (
          <div>
            {isResolved ? (
              <button
                className="hm-pdp-reopen-btn"
                onClick={() => reopenMutation.mutate(annotation.id)}
                disabled={isBusy}
              >
                {isBusy ? "Processing…" : "↩ Reopen"}
              </button>
            ) : (
              <button
                className="hm-pdp-resolve-btn"
                onClick={() => resolveMutation.mutate(annotation.id)}
                disabled={isBusy}
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