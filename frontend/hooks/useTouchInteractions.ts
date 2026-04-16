// hooks/useTouchInteractions.ts
"use client";

import { useRef, useCallback } from "react";
import { useAnnotationStore } from "@/store/annotationStore";

const LONG_PRESS_MS = 500;
const TAP_SLOP_PX = 10; // max movement to still count as tap

interface UseTouchInteractionsProps {
  imageId: string;
  annotations: Array<{ id: string; position_x: number; position_y: number }>;
  containerRef: React.RefObject<HTMLDivElement>;
  onCreateAnnotation: (posX: number, posY: number) => void;
  onDeleteAnnotation: (annotationId: string) => void;
  pinHitRadiusPx?: number;
}

export function useTouchInteractions({
  annotations,
  containerRef,
  onCreateAnnotation,
  onDeleteAnnotation,
  pinHitRadiusPx = 28,
}: UseTouchInteractionsProps) {
  const setActivePin = useAnnotationStore((s) => s.setActivePin);
  const setPendingPosition = useAnnotationStore((s) => s.setPendingPosition);

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const longPressTarget = useRef<string | null>(null); // annotationId if pressing a pin
  const didLongPress = useRef(false);

  // Resolve normalized coords from a touch event
  const getNormalized = useCallback(
    (touch: Touch): { normX: number; normY: number } | null => {
      const el = containerRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const normX = (touch.clientX - rect.left) / rect.width;
      const normY = (touch.clientY - rect.top) / rect.height;
      return { normX, normY };
    },
    [containerRef]
  );

  // Find which pin (if any) was hit
  const findHitPin = useCallback(
    (touch: Touch): string | null => {
      const el = containerRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();

      for (const ann of annotations) {
        const pinPxX = ann.position_x * rect.width + rect.left;
        const pinPxY = ann.position_y * rect.height + rect.top;
        const dist = Math.hypot(
          touch.clientX - pinPxX,
          touch.clientY - pinPxY
        );
        if (dist <= pinHitRadiusPx) return ann.id;
      }
      return null;
    },
    [annotations, containerRef, pinHitRadiusPx]
  );

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const onTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      const touch = e.touches[0];
      touchStartPos.current = { x: touch.clientX, y: touch.clientY };
      didLongPress.current = false;

      const hitId = findHitPin(touch);
      longPressTarget.current = hitId;

      if (hitId) {
        // Start long-press timer for delete
        longPressTimer.current = setTimeout(() => {
          didLongPress.current = true;
          onDeleteAnnotation(hitId);
          longPressTarget.current = null;
        }, LONG_PRESS_MS);
      }
    },
    [findHitPin, onDeleteAnnotation]
  );

  const onTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    const start = touchStartPos.current;
    if (!start) return;

    const moved =
      Math.abs(touch.clientX - start.x) > TAP_SLOP_PX ||
      Math.abs(touch.clientY - start.y) > TAP_SLOP_PX;

    if (moved) clearLongPress();
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      clearLongPress();

      if (didLongPress.current) {
        didLongPress.current = false;
        return;
      }

      const touch = e.changedTouches[0];
      const start = touchStartPos.current;
      if (!start) return;

      const moved =
        Math.abs(touch.clientX - start.x) > TAP_SLOP_PX ||
        Math.abs(touch.clientY - start.y) > TAP_SLOP_PX;

      if (moved) return; // was a scroll, not a tap

      const hitId = findHitPin(touch);

      if (hitId) {
        // Tap on existing pin → open panel
        setActivePin(hitId);
      } else {
        // Tap on empty canvas → create new annotation
        const norm = getNormalized(touch);
        if (!norm) return;
        setPendingPosition({ x: norm.normX, y: norm.normY });
        onCreateAnnotation(norm.normX, norm.normY);
      }

      touchStartPos.current = null;
    },
    [findHitPin, getNormalized, onCreateAnnotation, setActivePin, setPendingPosition]
  );

  const onTouchCancel = useCallback(() => {
    clearLongPress();
    touchStartPos.current = null;
    longPressTarget.current = null;
  }, []);

  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel };
}
