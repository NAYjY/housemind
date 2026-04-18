"use client";

/**
 * components/layout/BottomSheet.tsx — HouseMind
 * Luxury burnished-bronze bottom sheet.
 */

import { useRef, useState, useCallback, useEffect } from "react";

interface BottomSheetProps {
  children: React.ReactNode;
  isOpen: boolean;
  snapPoints?: number[];
  initialSnap?: number;
  onClose?: () => void;
}

const DEFAULT_SNAPS = [0.25, 0.6, 0.92];

export function BottomSheet({
  children,
  isOpen,
  snapPoints = DEFAULT_SNAPS,
  initialSnap = 0,
}: BottomSheetProps) {
  const [snapIdx, setSnapIdx]       = useState(initialSnap);
  const sheetRef                    = useRef<HTMLDivElement>(null);
  const dragStartY                  = useRef<number | null>(null);
  const startHeightFrac             = useRef<number>(snapPoints[initialSnap]);
  const [dragging, setDragging]     = useState(false);
  const [currentFrac, setCurrentFrac] = useState(snapPoints[initialSnap]);

  useEffect(() => { setCurrentFrac(snapPoints[snapIdx]); }, [snapIdx, snapPoints]);

  const handleDragStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const y = "touches" in e ? e.touches[0].clientY : e.clientY;
    dragStartY.current    = y;
    startHeightFrac.current = currentFrac;
    setDragging(true);
  }, [currentFrac]);

  const handleDragMove = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (dragStartY.current === null) return;
    const y   = "touches" in e ? e.touches[0].clientY : e.clientY;
    const vh  = window.innerHeight;
    const delta = (dragStartY.current - y) / vh;
    const newFrac = Math.max(
      snapPoints[0] * 0.5,
      Math.min(snapPoints[snapPoints.length - 1], startHeightFrac.current + delta)
    );
    setCurrentFrac(newFrac);
  }, [snapPoints]);

  const handleDragEnd = useCallback(() => {
    if (!dragging) return;
    setDragging(false);
    dragStartY.current = null;
    let nearest = 0;
    let minDist = Infinity;
    snapPoints.forEach((snap, i) => {
      const dist = Math.abs(snap - currentFrac);
      if (dist < minDist) { minDist = dist; nearest = i; }
    });
    setSnapIdx(nearest);
    setCurrentFrac(snapPoints[nearest]);
  }, [dragging, currentFrac, snapPoints]);

  const heightPct = `${currentFrac * 100}%`;

  return (
    <>
      {isOpen && currentFrac > 0.55 && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: `rgba(28,24,16,${(currentFrac - 0.55) * 1.4})`,
            zIndex: 39,
            pointerEvents: "none",
            transition: dragging ? "none" : "background 0.2s",
          }}
        />
      )}

      <div
        ref={sheetRef}
        style={{
          position: "fixed",
          left: 0, right: 0, bottom: 0,
          height: isOpen ? heightPct : "0px",
          zIndex: 40,
          background: "#FAF8F4",
          borderRadius: "18px 18px 0 0",
          boxShadow: "0 -4px 32px rgba(28,24,16,0.14)",
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
              width: 36,
              height: 3,
              borderRadius: 2,
              background: "#E0DAD0",
            }}
          />
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>{children}</div>
      </div>
    </>
  );
}
