// components/workspace/DeleteConfirmPopup.tsx
"use client";

import type { Annotation } from "@/store/annotationStore";
import { OBJECT_DEFS } from "./FanEmojiMenu";

interface Props {
  annotation: Annotation;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteConfirmPopup({ annotation, onCancel, onConfirm }: Props) {
  const def = OBJECT_DEFS[annotation.object_id];
  return (
  <div className="hm-del-overlay">
    <div className="hm-del-card">
      <div className="hm-del-icon">{def?.emoji ?? "📍"}</div>
      <div className="hm-del-title">Delete annotation?</div>
      <div className="hm-del-meta">
        {def?.label ?? "Pin"} · {Math.round(annotation.position_x * 100)}%,{" "}
        {Math.round(annotation.position_y * 100)}%
      </div>
      <div className="hm-del-actions">
        <button className="hm-del-cancel" onClick={onCancel}>Cancel</button>
        <button className="hm-del-confirm" onClick={onConfirm}>Delete</button>
      </div>
    </div>
  </div>
);
}