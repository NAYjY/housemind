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
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: "24px 24px 20px",
          width: 280,
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
        }}
      >
        <div style={{ fontSize: 32, textAlign: "center", marginBottom: 12 }}>
          {def?.emoji ?? "📍"}
        </div>
        <div
          style={{ fontSize: 14, fontWeight: 600, textAlign: "center", marginBottom: 4 }}
        >
          Delete annotation?
        </div>
        <div
          style={{
            fontSize: 12,
            color: "#888",
            textAlign: "center",
            marginBottom: 20,
          }}
        >
          {def?.label ?? "Pin"} · {Math.round(annotation.position_x * 100)}%,{" "}
          {Math.round(annotation.position_y * 100)}%
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              height: 40,
              borderRadius: 10,
              border: "0.5px solid #ddd",
              background: "#f5f5f5",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1,
              height: 40,
              borderRadius: 10,
              border: "none",
              background: "#E24B4A",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}