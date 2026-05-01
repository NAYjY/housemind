"use client";

import { FilmThumb } from "./FilmThumb";
import type { Slide } from "@/hooks/useSlides";
import styles from "./FilmStrip.module.css";

interface FilmStripProps {
  slides: Slide[];
  currentSlide: number;
  expanded: boolean;
  uploading: boolean;
  uploadError: string;
  isAuthenticated: boolean;
  refInput: string;
  onSlideChange: (index: number) => void;
  onToggleExpand: () => void;
  onRefInputChange: (value: string) => void;
  onUrlSubmit: (url: string) => void;
  onFileUpload: (file: File) => void;
}

export function FilmStrip({
  slides,
  currentSlide,
  expanded,
  uploading,
  uploadError,
  isAuthenticated,
  refInput,
  onSlideChange,
  onToggleExpand,
  onRefInputChange,
  onUrlSubmit,
  onFileUpload,
}: FilmStripProps) {
  return (
    <div className={`${styles.strip} ${expanded ? styles.expanded : styles.collapsed}`}>
      <div
        className={styles.trayRow}
        onWheel={(e) => {
          e.preventDefault();
          e.currentTarget.scrollLeft += e.deltaY;
        }}
      >
        {slides.map((s, i) => (
          <FilmThumb
            key={s.imageId}
            imageId={s.imageId}
            url={s.url}
            index={i}
            isActive={i === currentSlide}
            onClick={() => onSlideChange(i)}
          />
        ))}
        <button className={styles.addBtn} onClick={onToggleExpand}>
          <span className={styles.addIcon}>+</span>
          <span className={styles.addLabel}>Add</span>
        </button>
      </div>

      {expanded && (
        <div className={styles.uploadRow}>
          <div className={styles.inputRow}>
            <label
              className={styles.fileBtn}
              style={{ opacity: uploading || !isAuthenticated ? 0.5 : 1 }}
            >
              📁 {uploading ? "Uploading…" : "Upload image"}
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFileUpload(f);
                  e.target.value = "";
                }}
              />
            </label>
            <div style={{ flex: 1 }} />
            <button
              className={styles.closeBtn}
              onClick={() => {
                onToggleExpand();
                onRefInputChange("");
              }}
            >
              ×
            </button>
          </div>
          <div className={styles.inputRow}>
            <input
              className={styles.input}
              placeholder="Or paste image URL…"
              value={refInput}
              onChange={(e) => onRefInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onUrlSubmit(refInput);
              }}
            />
            <button
              className={styles.submitBtn}
              onClick={() => onUrlSubmit(refInput)}
            >
              Add
            </button>
          </div>
          {uploadError && (
            <div className={styles.uploadError}>⚠ {uploadError}</div>
          )}
        </div>
      )}
    </div>
  );
}