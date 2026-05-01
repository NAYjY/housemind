"use client";

import { type Annotation } from "@/store/annotationStore";
import { type ProductDetail } from "@/hooks/useProducts";
import { useResolveAnnotation, useReopenAnnotation } from "@/hooks/useAnnotations";
import { OBJECT_DEFS } from "@/components/workspace/FanEmojiMenu";
import styles from "./ProductDetailPanel.module.css";
import closeBtnStyles from "@/components/shared/CloseBtn.module.css";

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
    <div className={styles.wrap}>
      <div className={styles.header}>
        <button onClick={onClose} className={closeBtnStyles.closeBtn}>←</button>
        <div className={styles.title}>{product.name}</div>
      </div>

      {product.thumbnail_url && (
        <div className={styles.thumbWrap}>
          <img src={product.thumbnail_url} alt={product.name} className={styles.thumb} />
        </div>
      )}

      <div className={styles.body}>
        <div className={styles.name}>{product.name}</div>

        {product.brand && (
          <div className={styles.brand}>
            {product.brand}{product.model ? ` · ${product.model}` : ""}
          </div>
        )}

        {product.price != null && (
          <div className={styles.price}>
            ฿{product.price.toLocaleString("th-TH")} {product.currency}
          </div>
        )}

        {product.description && (
          <div className={styles.desc}>{product.description}</div>
        )}

        {product.specs && Object.keys(product.specs).length > 0 && (
          <div className={styles.specs}>
            <div className={styles.specsLabel}>Specifications</div>
            {Object.entries(product.specs).map(([k, v]) => (
              <div key={k} className={styles.specRow}>
                <span className={styles.specKey}>{k}</span>
                <span className={styles.specVal}>{String(v)}</span>
              </div>
            ))}
          </div>
        )}

        {annotation && def && (
          <div className={styles.pinBox}>
            <div className={styles.pinLabel}>Pinned at</div>
            <div className={styles.pinRow}>
              <span className={styles.pinEmoji}>{def.emoji}</span>
              <div>
                <div className={styles.pinName}>{def.label}</div>
                <div className={styles.pinMeta}>
                  {Math.round(annotation.position_x * 100)}%, {Math.round(annotation.position_y * 100)}%
                  {isResolved && <span className={styles.resolvedTag}>✓ Resolved</span>}
                </div>
              </div>
            </div>
          </div>
        )}

        {canResolve && annotation && (
          <div>
            {isResolved ? (
              <button
                className={styles.reopenBtn}
                onClick={() => reopenMutation.mutate(annotation.id)}
                disabled={isBusy}
              >
                {isBusy ? "Processing…" : "↩ Reopen"}
              </button>
            ) : (
              <button
                className={styles.resolveBtn}
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