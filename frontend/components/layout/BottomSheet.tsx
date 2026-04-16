// components/layout/BottomSheet.tsx
"use client";

import { useRef, useState, useCallback, useEffect } from "react";

interface BottomSheetProps {
  children: React.ReactNode;
  isOpen: boolean;
  snapPoints?: number[]; // e.g. [0.25, 0.6, 0.92] — fraction of viewport height
  initialSnap?: number; // index into snapPoints
  onClose?: () => void;
}

const DEFAULT_SNAPS = [0.25, 0.6, 0.92];

export function BottomSheet({
  children,
  isOpen,
  snapPoints = DEFAULT_SNAPS,
  initialSnap = 0,
}: BottomSheetProps) {
  const [snapIdx, setSnapIdx] = useState(initialSnap);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const startHeightFrac = useRef<number>(snapPoints[initialSnap]);
  const [dragging, setDragging] = useState(false);
  const [currentFrac, setCurrentFrac] = useState(snapPoints[initialSnap]);

  useEffect(() => {
    setCurrentFrac(snapPoints[snapIdx]);
  }, [snapIdx, snapPoints]);

  const handleDragStart = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      const y = "touches" in e ? e.touches[0].clientY : e.clientY;
      dragStartY.current = y;
      startHeightFrac.current = currentFrac;
      setDragging(true);
    },
    [currentFrac]
  );

  const handleDragMove = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      if (dragStartY.current === null) return;
      const y = "touches" in e ? e.touches[0].clientY : e.clientY;
      const vh = window.innerHeight;
      const delta = (dragStartY.current - y) / vh;
      const newFrac = Math.max(
        snapPoints[0] * 0.5,
        Math.min(snapPoints[snapPoints.length - 1], startHeightFrac.current + delta)
      );
      setCurrentFrac(newFrac);
    },
    [snapPoints]
  );

  const handleDragEnd = useCallback(() => {
    if (!dragging) return;
    setDragging(false);
    dragStartY.current = null;

    // Snap to nearest point
    let nearest = 0;
    let minDist = Infinity;
    snapPoints.forEach((snap, i) => {
      const dist = Math.abs(snap - currentFrac);
      if (dist < minDist) {
        minDist = dist;
        nearest = i;
      }
    });
    setSnapIdx(nearest);
    setCurrentFrac(snapPoints[nearest]);
  }, [dragging, currentFrac, snapPoints]);

  const heightPct = `${currentFrac * 100}%`;

  return (
    <>
      {/* Backdrop */}
      {isOpen && currentFrac > 0.55 && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: `rgba(0,0,0,${(currentFrac - 0.55) * 1.5})`,
            zIndex: 39,
            pointerEvents: "none",
            transition: dragging ? "none" : "background 0.2s",
          }}
        />
      )}

      {/* Sheet */}
      <div
        ref={sheetRef}
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          height: isOpen ? heightPct : "0px",
          zIndex: 40,
          background: "var(--color-surface)",
          borderRadius: "20px 20px 0 0",
          boxShadow: "0 -4px 32px rgba(0,0,0,0.18)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          transition: dragging ? "none" : "height 0.32s cubic-bezier(0.32,0.72,0,1)",
          willChange: "height",
        }}
      >
        {/* Drag handle */}
        <div
          style={{
            padding: "12px 0 8px",
            display: "flex",
            justifyContent: "center",
            cursor: "grab",
            touchAction: "none",
            flexShrink: 0,
          }}
          onTouchStart={handleDragStart}
          onTouchMove={handleDragMove}
          onTouchEnd={handleDragEnd}
          onMouseDown={handleDragStart}
          onMouseMove={dragging ? handleDragMove : undefined}
          onMouseUp={handleDragEnd}
        >
          <div
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              background: "var(--color-border)",
            }}
          />
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto" }}>{children}</div>
      </div>
    </>
  );
}
