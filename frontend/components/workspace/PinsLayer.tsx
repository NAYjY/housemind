// components/workspace/PinsLayer.tsx
"use client";

import { useRef } from "react";
import type { Annotation } from "@/store/annotationStore";
import { OBJECT_DEFS } from "./FanEmojiMenu";
import styles from "./PinsLayer.module.css";

const PIN_COLORS = [
  "#7F77DD", "#C9A84C", "#639922", "#E24B4A",
  "#888780", "#534AB7", "#C05A30", "#3B6D11",
];

interface Props {
  annotations: Annotation[];
  activeId: string | null;
  onSingleTap: (id: string) => void;
  onLongPress: (ann: Annotation) => void;
  onMove: (id: string, normX: number, normY: number) => void;
}

export function PinsLayer({ annotations, activeId, onSingleTap, onLongPress, onMove }: Props) {
  const timerRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const startPos = useRef<Record<string, { x: number; y: number }>>({});
  const dragging = useRef<string | null>(null);

  const getContainer = () =>
    document.querySelector(`.${styles.canvasWrap}`) as HTMLDivElement | null;

  return (
    <>
      {annotations.map((ann, i) => {
        const isActive = ann.id === activeId;
        const color = ann.resolution_state === "RESOLVED"
          ? "#639922"
          : ann.resolution_state === "PARTIAL"
            ? "#C49A3C"
            : PIN_COLORS[i % PIN_COLORS.length] ?? "#7F77DD";
        const def = OBJECT_DEFS[ann.object_id];

        return (
          <div
            key={ann.id}
            className={styles.pin}
            style={{
              left: `${ann.position_x * 100}%`,
              top: `${ann.position_y * 100}%`,
              touchAction: "none",
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              startPos.current[ann.id] = { x: e.clientX, y: e.clientY };
              dragging.current = null;
              timerRefs.current[ann.id] = setTimeout(() => {
                onLongPress(ann);
                dragging.current = null;
              }, 600);
            }}
            onPointerMove={(e) => {
              e.stopPropagation();
              const start = startPos.current[ann.id];
              if (!start || e.buttons === 0) return;
              const moved =
                Math.abs(e.clientX - start.x) > 6 || Math.abs(e.clientY - start.y) > 6;
              if (moved) {
                e.preventDefault();
                clearTimeout(timerRefs.current[ann.id]);
                dragging.current = ann.id;
                const container = getContainer();
                if (!container) return;
                const rect = container.getBoundingClientRect();
                const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
                const el = e.currentTarget as HTMLDivElement;
                el.style.left = `${normX * 100}%`;
                el.style.top = `${normY * 100}%`;
              }
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              const start = startPos.current[ann.id];
              const wasDragging = dragging.current === ann.id;
              const moved = start
                ? Math.abs(e.clientX - start.x) > 6 || Math.abs(e.clientY - start.y) > 6
                : false;
              clearTimeout(timerRefs.current[ann.id]);
              if (wasDragging && moved) {
                const container = getContainer();
                if (container) {
                  const rect = container.getBoundingClientRect();
                  const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
                  onMove(ann.id, normX, normY);
                }
              } else if (!moved) {
                onSingleTap(ann.id);
              }
              dragging.current = null;
            }}
          >
            <div
              className={styles.bubble + (isActive ? " " + styles.active : "")}
              style={{ background: color, fontSize: 16 }}
            >
              <div className={styles.inner}>{def?.emoji ?? "📍"}</div>
            </div>
            <div className={styles.tail} />
          </div>
        );
      })}
    </>
  );
}