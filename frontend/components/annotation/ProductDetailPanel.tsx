"use client";

import { type Annotation } from "@/store/annotationStore";
import { type ProductDetail } from "@/hooks/useProducts";
import { useResolveAnnotation, useUnresolveAnnotation } from "@/hooks/useAnnotations";
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
  const unresolveMutation = useUnresolveAnnotation(imageId);
  const isBusy = resolveMutation.isPending || unresolveMutation.isPending;
  const iAmResolved = annotation?.resolutions.some((r) => r.is_resolved) ?? false;
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
                  {annotation.resolution_state === "RESOLVED" && (
                    <span className={styles.resolvedTag}>✓ Resolved</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {canResolve && annotation && (
          <div>
            <div className={styles.resolutionList}>
              {annotation.required_roles.map((role) => {
                const roleResolutions = annotation.resolutions.filter(
                  (r) => r.role === role && r.is_resolved
                );
                const done = roleResolutions.length > 0;
                const latest = roleResolutions[0];
                return (
                  <div key={role} className={styles.resolutionRow}>
                    <span className={`${styles.resolutionIcon}${done ? ` ${styles.done}` : ""}`}>
                      {done ? "✓" : "○"}
                    </span>
                    <span className={`${styles.resolutionRole}${done ? ` ${styles.done}` : ""}`}>
                      {role}
                    </span>
                    {done && latest && (
                      <span className={styles.resolutionTime}>
                        {new Date(latest.resolved_at).toLocaleString("th-TH", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {iAmResolved ? (
              <button
                className={styles.reopenBtn}
                onClick={() => unresolveMutation.mutate(annotation.id)}
                disabled={isBusy}
              >
                {isBusy ? "Processing…" : "↩ Un-resolve"}
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