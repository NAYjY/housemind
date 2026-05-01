// components/workspace/DeleteConfirmPopup.tsx
"use client";

import type { Annotation } from "@/store/annotationStore";
import { OBJECT_DEFS } from "./FanEmojiMenu";
import styles from "./DeleteConfirmPopup.module.css";

interface Props {
  annotation: Annotation;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteConfirmPopup({ annotation, onCancel, onConfirm }: Props) {
  const def = OBJECT_DEFS[annotation.object_id];
  return (
  <div className={styles.overlay}>
    <div className={styles.card}>
      <div className={styles.icon}>{def?.emoji ?? "📍"}</div>
      <div className={styles.title}>Delete annotation?</div>
      <div className={styles.meta}>
        {def?.label ?? "Pin"} · {Math.round(annotation.position_x * 100)}%,{" "}
        {Math.round(annotation.position_y * 100)}%
      </div>
      <div className={styles.actions}>
        <button className={styles.cancel} onClick={onCancel}>
          Cancel
        </button>
        <button className={styles.confirm} onClick={onConfirm}>
          Delete
        </button>
      </div>
    </div>
  </div>
);
}