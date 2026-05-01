"use client";

import { useRef, useCallback } from "react";
import type { Annotation } from "@/store/annotationStore";
import { PinsLayer } from "./PinsLayer";
import { FilmStrip } from "./FilmStrip";
import type { Slide } from "@/hooks/useSlides";
import styles from "./WorkspaceCanvas.module.css";

interface WorkspaceCanvasProps {
  activeSlide: Slide;
  slides: Slide[];
  currentSlide: number;
  annotations: Annotation[];
  activePinId: string | null;
  readOnly: boolean;
  isAuthenticated: boolean;
  canAnnotate: boolean;
  isCreating: boolean;
  filmExpanded: boolean;
  uploading: boolean;
  uploadError: string;
  refInput: string;
  showMultipleSlides: boolean;
  onLongPress: (normX: number, normY: number, clientX: number, clientY: number) => void;
  onPinTap: (id: string) => void;
  onPinLongPress: (ann: Annotation) => void;
  onPinMove: (id: string, normX: number, normY: number) => void;
  onSlideChange: (index: number) => void;
  onSlidePrev: () => void;
  onSlideNext: () => void;
  onFilmToggle: () => void;
  onRefInputChange: (value: string) => void;
  onUrlSubmit: (url: string) => void;
  onFileUpload: (file: File) => void;
  onImageError: () => void;
}

export function WorkspaceCanvas({
  activeSlide,
  slides,
  currentSlide,
  annotations,
  activePinId,
  readOnly,
  isAuthenticated,
  canAnnotate,
  isCreating,
  filmExpanded,
  uploading,
  uploadError,
  refInput,
  showMultipleSlides,
  onLongPress,
  onPinTap,
  onPinLongPress,
  onPinMove,
  onSlideChange,
  onSlidePrev,
  onSlideNext,
  onFilmToggle,
  onRefInputChange,
  onUrlSubmit,
  onFileUpload,
  onImageError,
}: WorkspaceCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const toNorm = useCallback(
    (clientX: number, clientY: number) => {
      const el = canvasRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        normX: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
        normY: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
      };
    },
    []
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (readOnly || !isAuthenticated) return;
    touchStart.current = { x: e.clientX, y: e.clientY };
    longPressTimer.current = setTimeout(() => {
      const norm = toNorm(e.clientX, e.clientY);
      if (!norm) return;
      onLongPress(norm.normX, norm.normY, e.clientX, e.clientY);
    }, 600);
  };

  const handlePointerUp = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = touchStart.current;
    if (!start) return;
    const moved =
      Math.abs(e.clientX - start.x) > 8 || Math.abs(e.clientY - start.y) > 8;
    if (moved && longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  return (
    <div className={styles.wrap}>
      {activeSlide.url && (
        <img
          className={styles.img}
          src={activeSlide.url}
          alt={activeSlide.label}
          onError={onImageError}
        />
      )}

      <div
        ref={canvasRef}
        className={styles.tap}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerUp}
      />

      {annotations.length === 0 && canAnnotate && (
        <div className={styles.hint}>
          {isAuthenticated ? "Hold to annotate" : "Sign in to annotate"}
        </div>
      )}

      <PinsLayer
        annotations={annotations}
        activeId={activePinId}
        onSingleTap={onPinTap}
        onLongPress={onPinLongPress}
        onMove={onPinMove}
      />

      {isCreating && (
        <div className={styles.creating}>
          <div className="spinner" />
        </div>
      )}

      {showMultipleSlides && (
        <div className={styles.carouselNav}>
          <button
            className={styles.carouselBtn}
            onClick={onSlidePrev}
          >
            ‹
          </button>
          <button
            className={styles.carouselBtn}
            onClick={onSlideNext}
          >
            ›
          </button>
        </div>
      )}

      <FilmStrip
        slides={slides}
        currentSlide={currentSlide}
        expanded={filmExpanded}
        uploading={uploading}
        uploadError={uploadError}
        isAuthenticated={isAuthenticated}
        refInput={refInput}
        onSlideChange={onSlideChange}
        onToggleExpand={onFilmToggle}
        onRefInputChange={onRefInputChange}
        onUrlSubmit={onUrlSubmit}
        onFileUpload={onFileUpload}
      />
    </div>
  );
}