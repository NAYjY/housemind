"use client";

import { FilmThumb } from "./FilmThumb";
import type { Slide } from "@/hooks/useSlides";

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
    <div className={`hm-filmstrip ${expanded ? "expanded" : "collapsed"}`}>
      <div
        className="hm-tray-row"
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
        <button className="hm-film-add" onClick={onToggleExpand}>
          <span className="hm-film-add-icon">+</span>
          <span className="hm-film-add-label">Add</span>
        </button>
      </div>

      {expanded && (
        <div className="hm-tray-upload-row">
          <div className="hm-tray-input-row">
            <label
              className="hm-tray-file-btn"
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
              className="hm-tray-close"
              onClick={() => {
                onToggleExpand();
                onRefInputChange("");
              }}
            >
              ×
            </button>
          </div>
          <div className="hm-tray-input-row">
            <input
              className="hm-tray-input"
              placeholder="Or paste image URL…"
              value={refInput}
              onChange={(e) => onRefInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onUrlSubmit(refInput);
              }}
            />
            <button
              className="hm-tray-submit"
              onClick={() => onUrlSubmit(refInput)}
            >
              Add
            </button>
          </div>
          {uploadError && (
            <div className="hm-upload-error">⚠ {uploadError}</div>
          )}
        </div>
      )}
    </div>
  );
}