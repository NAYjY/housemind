"use client";

// components/workspace/WorkspaceShell.tsx
// Matches the reference design: dark hero bar, filmstrip tray, canvas with pins,
// 2-col product grid, slide-up detail panel.

import { useState, useRef, useCallback, useEffect } from "react";
import Image from "next/image";
import { useAnnotations, useCreateAnnotation, useDeleteAnnotation, useResolveAnnotation, useReopenAnnotation, useProductDetail } from "@/hooks/useAnnotations";
import { useAnnotationStore, type Annotation } from "@/store/annotationStore";
import { useAuth } from "@/hooks/useAuth";

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Slide {
  imageId: string;
  url: string;
  label: string;
}

interface Props {
  imageId: string;
  imageUrl: string;
  projectId: string;
  forceReadOnly?: boolean;
}

// ── Colour palette per pin index ──────────────────────────────────────────────
const PIN_COLORS = ["#7F77DD", "#C9A84C", "#639922", "#E24B4A", "#888780", "#534AB7"];

// ── Main shell ─────────────────────────────────────────────────────────────────

export function WorkspaceShell({ imageId, imageUrl, projectId, forceReadOnly }: Props) {
  const auth = useAuth();
  const readOnly = forceReadOnly || auth.isReadOnly;

  // Slides — start with the passed image, more can be added via filmstrip
  const [slides, setSlides] = useState<Slide[]>([
    { imageId, url: imageUrl, label: "Reference 1" },
  ]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const activeSlide = slides[currentSlide];

  // Filmstrip expand state
  const [filmExpanded, setFilmExpanded] = useState(false);
  const [refInput, setRefInput] = useState("");

  // Active pin / detail panel
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);

  // Long-press state for delete
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch annotations for current slide
  useAnnotations(activeSlide.imageId);
  const annotations = useAnnotationStore((s) => s.annotationsByImage[activeSlide.imageId] ?? []);
  const createMutation = useCreateAnnotation(activeSlide.imageId);
  const deleteMutation = useDeleteAnnotation(activeSlide.imageId);

  const activeAnnotation = activeAnnotationId
    ? annotations.find((a) => a.id === activeAnnotationId) ?? null
    : null;

  // ── Canvas tap to create ───────────────────────────────────────────────────

  const canvasRef = useRef<HTMLDivElement>(null);

  const handleCanvasTap = useCallback(
    (clientX: number, clientY: number) => {
      if (readOnly || activeAnnotationId) {
        setActiveAnnotationId(null);
        return;
      }
      const el = canvasRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = (clientX - rect.left) / rect.width;
      const y = (clientY - rect.top) / rect.height;
      createMutation.mutate({ positionX: x, positionY: y });
    },
    [readOnly, activeAnnotationId, createMutation]
  );

  // ── Filmstrip add ref ──────────────────────────────────────────────────────

  const submitRef = () => {
    const url = refInput.trim();
    if (!url) return;
    const idx = slides.length;
    setSlides((prev) => [
      ...prev,
      { imageId: `local-${idx}`, url, label: `Reference ${idx + 1}` },
    ]);
    setCurrentSlide(idx);
    setRefInput("");
    setFilmExpanded(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500&display=swap');

        :root {
          --stone-50:#FAFAF8; --stone-100:#F5F4F0; --stone-200:#E8E6E0;
          --stone-300:#D4D1C7; --stone-500:#888780; --stone-700:#444441; --stone-900:#1A1A18;
          --accent:#7F77DD; --accent-dark:#534AB7;
          --success:#639922; --gold:#C9A84C; --gold-light:#F5EDD4;
        }

        .hm-app {
          font-family: 'DM Sans', sans-serif;
          background: var(--stone-50);
          color: var(--stone-900);
          width: 100%;
          max-width: 430px;
          min-height: 100vh;
          margin: 0 auto;
          position: relative;
          overflow-x: hidden;
        }

        /* Hero bar */
        .hm-hero-bar {
          background: var(--stone-900);
          padding: 18px 20px 14px;
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
        }
        .hm-wordmark {
          font-family: 'DM Serif Display', serif;
          font-size: 24px;
          color: #fff;
          letter-spacing: -0.02em;
          line-height: 1;
        }
        .hm-wordmark span { color: var(--gold); }
        .hm-hero-sub {
          font-size: 9px;
          color: rgba(255,255,255,0.4);
          letter-spacing: 0.14em;
          text-transform: uppercase;
          margin-top: 2px;
        }
        .hm-role-badge {
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 5px 10px;
          border-radius: 20px;
          border: 0.5px solid rgba(255,255,255,0.18);
          color: rgba(255,255,255,0.55);
          background: transparent;
          cursor: pointer;
        }

        /* Project nav */
        .hm-proj-nav {
          background: var(--stone-100);
          border-bottom: 0.5px solid var(--stone-200);
          padding: 10px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .hm-proj-label { font-size: 10px; color: var(--stone-500); letter-spacing: 0.08em; text-transform: uppercase; }
        .hm-proj-name { font-size: 14px; font-weight: 500; color: var(--stone-900); display: flex; align-items: center; gap: 6px; cursor: pointer; }
        .hm-add-btn {
          height: 28px; padding: 0 12px;
          background: var(--stone-900); color: #fff;
          border: none; border-radius: 20px;
          font-family: 'DM Sans', sans-serif;
          font-size: 10px; font-weight: 500;
          letter-spacing: 0.06em; cursor: pointer;
        }
        .hm-add-btn:hover { background: var(--accent); }

        /* Canvas */
        .hm-canvas-wrap {
          position: relative;
          width: 100%;
          aspect-ratio: 1/1;
          overflow: hidden;
          background: var(--stone-200);
        }
        .hm-canvas-img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .hm-canvas-overlay {
          position: absolute;
          inset: 0;
          cursor: crosshair;
          z-index: 5;
        }

        /* Carousel nav */
        .hm-carousel-nav {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 100%;
          display: flex;
          justify-content: space-between;
          padding: 0 10px;
          pointer-events: none;
          z-index: 15;
        }
        .hm-c-btn {
          pointer-events: auto;
          width: 30px; height: 30px;
          border-radius: 50%;
          background: rgba(0,0,0,0.45);
          border: 0.5px solid rgba(255,255,255,0.14);
          color: #fff;
          font-size: 18px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
          line-height: 1;
        }

        /* Filmstrip tray */
        .hm-filmstrip {
          position: absolute;
          bottom: 0; left: 0; right: 0;
          background: rgba(0,0,0,0.62);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border-top: 0.5px solid rgba(255,255,255,0.07);
          z-index: 20;
          transition: height 0.28s cubic-bezier(0.32,0.72,0,1);
          overflow: hidden;
        }
        .hm-filmstrip.collapsed { height: 68px; }
        .hm-filmstrip.expanded { height: 124px; }
        .hm-tray-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 11px 12px;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .hm-tray-row::-webkit-scrollbar { display: none; }
        .hm-film-thumb {
          flex-shrink: 0;
          width: 46px; height: 46px;
          border-radius: 7px;
          border: 1.5px solid transparent;
          background: rgba(255,255,255,0.08);
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          cursor: pointer;
          position: relative;
          overflow: hidden;
          transition: border-color 0.15s, background 0.15s;
          font-family: 'DM Serif Display', serif;
          font-size: 15px;
          color: rgba(255,255,255,0.5);
        }
        .hm-film-thumb.active { border-color: var(--gold); background: rgba(201,168,76,0.15); }
        .hm-film-thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.7; }
        .hm-slide-num {
          position: absolute; bottom: 2px; right: 4px;
          font-size: 8px; font-family: 'DM Sans', sans-serif;
          color: rgba(255,255,255,0.4);
        }
        .hm-film-add {
          flex-shrink: 0;
          width: 46px; height: 46px;
          border-radius: 7px;
          border: 1.5px dashed rgba(255,255,255,0.22);
          background: transparent;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          gap: 2px; cursor: pointer;
          transition: border-color 0.2s, background 0.2s;
        }
        .hm-film-add:hover { border-color: var(--gold); background: rgba(201,168,76,0.08); }
        .hm-film-add-icon { font-size: 15px; color: rgba(255,255,255,0.45); line-height: 1; }
        .hm-film-add-label { font-size: 8px; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255,255,255,0.3); }
        .hm-tray-hint { font-size: 10px; color: rgba(255,255,255,0.2); letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap; flex-shrink: 0; padding-left: 4px; }

        /* Tray input row (expanded) */
        .hm-tray-input-row {
          display: flex;
          gap: 8px;
          padding: 0 12px 10px;
          animation: hm-fade-slide 0.2s ease;
        }
        @keyframes hm-fade-slide { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        .hm-tray-input {
          flex: 1; height: 36px;
          background: rgba(255,255,255,0.1);
          border: 0.5px solid rgba(255,255,255,0.18);
          border-radius: 8px;
          padding: 0 12px;
          font-family: 'DM Sans', sans-serif;
          font-size: 12px; color: #fff; outline: none;
        }
        .hm-tray-input::placeholder { color: rgba(255,255,255,0.3); }
        .hm-tray-input:focus { border-color: var(--gold); }
        .hm-tray-submit {
          height: 36px; padding: 0 14px;
          background: var(--gold); border: none; border-radius: 8px;
          font-family: 'DM Sans', sans-serif;
          font-size: 11px; font-weight: 500;
          color: #3A2E10; cursor: pointer; white-space: nowrap; letter-spacing: 0.04em;
        }
        .hm-tray-close {
          height: 36px; width: 36px; flex-shrink: 0;
          background: rgba(255,255,255,0.07);
          border: 0.5px solid rgba(255,255,255,0.14);
          border-radius: 8px; color: rgba(255,255,255,0.45);
          font-size: 16px; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
        }

        /* Annotation pins */
        .hm-pin {
          position: absolute;
          transform: translate(-50%, -100%);
          cursor: pointer;
          z-index: 10;
          pointer-events: auto;
        }
        .hm-pin-bubble {
          width: 32px; height: 32px;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          display: flex; align-items: center; justify-content: center;
          border: 2px solid #fff;
          box-shadow: 0 3px 12px rgba(0,0,0,0.25);
          font-size: 11px; font-weight: 500; color: #fff;
          transition: width 0.15s, height 0.15s;
        }
        .hm-pin-bubble.active { width: 38px; height: 38px; }
        .hm-pin-inner { transform: rotate(45deg); }
        .hm-pin-tail { width: 2px; height: 7px; background: rgba(255,255,255,0.75); margin: -1px auto 0; }

        /* Section header */
        .hm-section-header {
          padding: 16px 20px 0;
          display: flex; align-items: center; justify-content: space-between;
          background: var(--stone-50);
        }
        .hm-section-title {
          font-family: 'DM Serif Display', serif;
          font-size: 17px; color: var(--stone-900);
        }
        .hm-item-count { font-size: 10px; color: var(--stone-500); letter-spacing: 0.08em; text-transform: uppercase; }

        /* Product grid */
        .hm-product-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          padding: 12px 20px 80px;
          background: var(--stone-50);
        }
        .hm-prod-card {
          background: #fff;
          border: 0.5px solid var(--stone-200);
          border-radius: 12px;
          padding: 10px;
          cursor: pointer;
          position: relative;
          transition: border-color 0.18s;
        }
        .hm-prod-card:hover { border-color: var(--accent); }
        .hm-prod-img {
          width: 100%; aspect-ratio: 1/1;
          border-radius: 8px;
          background: var(--stone-100);
          margin-bottom: 8px;
          display: flex; align-items: center; justify-content: center;
          overflow: hidden; position: relative;
        }
        .hm-prod-letter {
          font-family: 'DM Serif Display', serif;
          font-size: 28px; color: var(--stone-300);
        }
        .hm-prod-title { font-size: 12px; font-weight: 500; color: var(--stone-900); line-height: 1.3; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .hm-prod-tag { font-size: 10px; color: var(--accent-dark); font-weight: 500; margin-bottom: 2px; }
        .hm-prod-contact { font-size: 10px; color: var(--stone-500); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .hm-resolved-badge { font-size: 9px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--success); font-weight: 500; margin-bottom: 2px; }
        .hm-prod-del {
          position: absolute; top: 6px; right: 6px;
          width: 20px; height: 20px;
          border-radius: 50%;
          background: var(--stone-200); border: none;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; opacity: 0;
          transition: opacity 0.15s;
          font-size: 12px; color: var(--stone-500);
        }
        .hm-prod-card:hover .hm-prod-del { opacity: 1; }

        /* Detail panel */
        .hm-detail-panel {
          position: fixed;
          inset: 0;
          background: var(--stone-50);
          z-index: 200;
          display: flex;
          flex-direction: column;
          max-width: 430px;
          margin: 0 auto;
          animation: hm-slide-up 0.22s cubic-bezier(0.32,0.72,0,1);
        }
        @keyframes hm-slide-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .hm-detail-header {
          padding: 16px 20px;
          border-bottom: 0.5px solid var(--stone-200);
          display: flex; align-items: center; justify-content: space-between;
          background: var(--stone-50);
          flex-shrink: 0;
        }
        .hm-detail-label { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--stone-500); }
        .hm-close-btn {
          width: 30px; height: 30px;
          border-radius: 50%;
          background: var(--stone-100); border: none;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          color: var(--stone-500); font-size: 16px;
        }
        .hm-detail-img {
          width: 100%; aspect-ratio: 4/3;
          background: var(--stone-100);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          position: relative;
          overflow: hidden;
        }
        .hm-detail-body { flex: 1; padding: 16px 20px; overflow-y: auto; }
        .hm-detail-name { font-family: 'DM Serif Display', serif; font-size: 21px; color: var(--stone-900); margin-bottom: 4px; line-height: 1.2; }
        .hm-detail-brand { font-size: 12px; color: var(--stone-500); margin-bottom: 14px; }
        .hm-price-chip {
          display: inline-block;
          background: var(--gold-light); color: #7A6020;
          font-size: 17px; font-weight: 500;
          padding: 8px 16px; border-radius: 10px;
          margin-bottom: 16px;
          font-family: 'DM Serif Display', serif;
        }
        .hm-spec-label { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--stone-500); margin-bottom: 8px; }
        .hm-spec-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 0.5px solid var(--stone-100); font-size: 12px; }
        .hm-spec-key { color: var(--stone-500); }
        .hm-spec-val { color: var(--stone-900); font-weight: 500; }
        .hm-contact-block {
          font-size: 12px; color: var(--stone-900);
          margin-top: 12px; padding: 10px 14px;
          background: var(--stone-100);
          border-radius: 10px;
          border: 0.5px solid var(--stone-200);
        }
        .hm-detail-footer {
          padding: 14px 20px;
          border-top: 0.5px solid var(--stone-200);
          background: var(--stone-50);
          flex-shrink: 0;
        }
        .hm-resolve-btn {
          width: 100%; height: 44px;
          background: #EAF3DE; color: #3B6D11;
          border: none; border-radius: 12px;
          font-family: 'DM Sans', sans-serif;
          font-size: 12px; font-weight: 500;
          cursor: pointer;
          transition: opacity 0.15s;
        }
        .hm-resolve-btn:disabled { opacity: 0.5; cursor: wait; }
        .hm-reopen-btn {
          width: 100%; height: 44px;
          background: var(--stone-100); color: var(--stone-500);
          border: 0.5px solid var(--stone-200); border-radius: 12px;
          font-family: 'DM Sans', sans-serif;
          font-size: 12px; font-weight: 500;
          cursor: pointer;
        }

        /* Empty canvas hint */
        .hm-canvas-hint {
          position: absolute;
          bottom: 80px; left: 50%; transform: translateX(-50%);
          font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase;
          color: rgba(255,255,255,0.35);
          font-family: 'DM Serif Display', serif;
          pointer-events: none; white-space: nowrap;
          z-index: 6;
        }

        /* Spinner overlay on create */
        .hm-creating {
          position: absolute; inset: 0; z-index: 30;
          background: rgba(0,0,0,0.08);
          display: flex; align-items: center; justify-content: center;
          pointer-events: none;
        }
      `}</style>

      <div className="hm-app">
        {/* ── Hero bar ──────────────────────────────────────────────────────── */}
        <div className="hm-hero-bar">
          <div>
            <div className="hm-wordmark">House<span>Mind</span></div>
            <div className="hm-hero-sub">Visual decisions workspace</div>
          </div>
          <button className="hm-role-badge">
            {auth.role ?? "Viewer"}
          </button>
        </div>

        {/* ── Project nav ───────────────────────────────────────────────────── */}
        <div className="hm-proj-nav">
          <div>
            <div className="hm-proj-label">Project</div>
            <div className="hm-proj-name">
              <span>{projectId}</span>
              <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
                <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            </div>
          </div>
          {!readOnly && (
            <button className="hm-add-btn" onClick={() => alert("Add item — wire up your product modal here")}>
              + Add item
            </button>
          )}
        </div>

        {/* ── Canvas ────────────────────────────────────────────────────────── */}
        <div className="hm-canvas-wrap">
          {/* Image */}
          {activeSlide.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="hm-canvas-img"
              src={activeSlide.url}
              alt={activeSlide.label}
            />
          )}

          {/* Tap overlay */}
          <div
            ref={canvasRef}
            className="hm-canvas-overlay"
            onClick={(e) => handleCanvasTap(e.clientX, e.clientY)}
          />

          {/* Empty hint */}
          {annotations.length === 0 && !readOnly && (
            <div className="hm-canvas-hint">Hold to annotate</div>
          )}

          {/* Pins */}
          <PinsLayer
            annotations={annotations}
            activeId={activeAnnotationId}
            onSelect={setActiveAnnotationId}
            onDelete={readOnly ? undefined : (id) => deleteMutation.mutate(id)}
          />

          {/* Creating spinner */}
          {createMutation.isPending && (
            <div className="hm-creating">
              <div className="spinner" />
            </div>
          )}

          {/* Carousel nav */}
          {slides.length > 1 && (
            <div className="hm-carousel-nav">
              <button className="hm-c-btn" onClick={() => setCurrentSlide((i) => (i - 1 + slides.length) % slides.length)}>‹</button>
              <button className="hm-c-btn" onClick={() => setCurrentSlide((i) => (i + 1) % slides.length)}>›</button>
            </div>
          )}

          {/* Filmstrip tray */}
          <div className={`hm-filmstrip ${filmExpanded ? "expanded" : "collapsed"}`}>
            <div className="hm-tray-row">
              {slides.map((s, i) => (
                <div
                  key={s.imageId}
                  className={`hm-film-thumb ${i === currentSlide ? "active" : ""}`}
                  onClick={() => { setCurrentSlide(i); setFilmExpanded(false); }}
                >
                  {s.url && <img src={s.url} alt={s.label} />}
                  <span style={{ position: "relative", zIndex: 1 }}>{i + 1}</span>
                  <span className="hm-slide-num">img</span>
                </div>
              ))}
              <button className="hm-film-add" onClick={() => setFilmExpanded(true)}>
                <span className="hm-film-add-icon">+</span>
                <span className="hm-film-add-label">Ref</span>
              </button>
              <span className="hm-tray-hint">Filmstrip</span>
            </div>

            {filmExpanded && (
              <div className="hm-tray-input-row">
                <input
                  className="hm-tray-input"
                  placeholder="Paste image URL…"
                  value={refInput}
                  onChange={(e) => setRefInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitRef()}
                  autoFocus
                />
                <button className="hm-tray-submit" onClick={submitRef}>Upload</button>
                <button className="hm-tray-close" onClick={() => { setFilmExpanded(false); setRefInput(""); }}>×</button>
              </div>
            )}
          </div>
        </div>

        {/* ── Product section ───────────────────────────────────────────────── */}
        <ProductSection
          imageId={activeSlide.imageId}
          annotations={annotations}
          readOnly={readOnly}
          onSelectAnnotation={setActiveAnnotationId}
        />

        {/* ── Detail panel ──────────────────────────────────────────────────── */}
        {activeAnnotation && (
          <DetailPanel
            annotation={activeAnnotation}
            canResolve={auth.canResolve}
            imageId={activeSlide.imageId}
            onClose={() => setActiveAnnotationId(null)}
          />
        )}
      </div>
    </>
  );
}

// ── Pins layer ──────────────────────────────────────────────────────────────

function PinsLayer({
  annotations,
  activeId,
  onSelect,
  onDelete,
}: {
  annotations: Annotation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  return (
    <>
      {annotations.map((ann, i) => {
        const isActive = ann.id === activeId;
        const color = PIN_COLORS[i % PIN_COLORS.length];

        return (
          <div
            key={ann.id}
            className="hm-pin"
            style={{ left: `${ann.position_x * 100}%`, top: `${ann.position_y * 100}%` }}
            onPointerDown={() => {
              longPressTimer.current = setTimeout(() => {
                onDelete?.(ann.id);
              }, 600);
            }}
            onPointerUp={() => {
              if (longPressTimer.current) clearTimeout(longPressTimer.current);
              onSelect(ann.id);
            }}
            onPointerLeave={() => {
              if (longPressTimer.current) clearTimeout(longPressTimer.current);
            }}
          >
            <div
              className={`hm-pin-bubble ${isActive ? "active" : ""}`}
              style={{ background: color }}
            >
              <div className="hm-pin-inner">{i + 1}</div>
            </div>
            <div className="hm-pin-tail" />
          </div>
        );
      })}
    </>
  );
}

// ── Product section ─────────────────────────────────────────────────────────

function ProductSection({
  imageId,
  annotations,
  readOnly,
  onSelectAnnotation,
}: {
  imageId: string;
  annotations: Annotation[];
  readOnly: boolean;
  onSelectAnnotation: (id: string) => void;
}) {
  // Each annotation is an "item" — show them in a 2-col grid
  const count = annotations.length;

  return (
    <>
      <div className="hm-section-header">
        <div className="hm-section-title">Referenced Items</div>
        <div className="hm-item-count">{count} {count === 1 ? "item" : "items"}</div>
      </div>

      <div className="hm-product-grid">
        {annotations.map((ann, i) => (
          <AnnotationCard
            key={ann.id}
            annotation={ann}
            index={i}
            readOnly={readOnly}
            onClick={() => onSelectAnnotation(ann.id)}
          />
        ))}

        {count === 0 && (
          <div style={{
            gridColumn: "1/-1",
            padding: "40px 0",
            textAlign: "center",
            color: "var(--stone-300)",
            fontFamily: "'DM Serif Display', serif",
            fontSize: 15,
          }}>
            Tap the canvas to add annotations
          </div>
        )}
      </div>
    </>
  );
}

function AnnotationCard({
  annotation,
  index,
  readOnly,
  onClick,
}: {
  annotation: Annotation;
  index: number;
  readOnly: boolean;
  onClick: () => void;
}) {
  const color = PIN_COLORS[index % PIN_COLORS.length];
  const isResolved = !!annotation.resolved_at;
  const LETTERS = "MFBCAVDKSPRTZWQJYING";

  return (
    <div className="hm-prod-card" onClick={onClick}>
      {!readOnly && (
        <button
          className="hm-prod-del"
          onClick={(e) => { e.stopPropagation(); /* delete handled via long press on pin */ }}
        >
          ×
        </button>
      )}
      <div className="hm-prod-img">
        {annotation.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={annotation.thumbnail_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div className="hm-prod-letter">{LETTERS[index % LETTERS.length]}</div>
        )}
      </div>
      <div className="hm-prod-title">Annotation #{index + 1}</div>
      <div className="hm-prod-tag" style={{ color }}>
        #{index} · {isResolved ? "✓" : "○"}
      </div>
      {isResolved && <div className="hm-resolved-badge">✓ Resolved</div>}
      <div className="hm-prod-contact">
        {Math.round(annotation.position_x * 100)}%, {Math.round(annotation.position_y * 100)}%
      </div>
    </div>
  );
}

// ── Detail panel ─────────────────────────────────────────────────────────────

function DetailPanel({
  annotation,
  canResolve,
  imageId,
  onClose,
}: {
  annotation: Annotation;
  canResolve: boolean;
  imageId: string;
  onClose: () => void;
}) {
  const { data: product, isLoading } = useProductDetail(annotation.linked_product_id);
  const resolveMutation = useResolveAnnotation(imageId);
  const reopenMutation = useReopenAnnotation(imageId);
  const isResolved = !!annotation.resolved_at;
  const isBusy = resolveMutation.isPending || reopenMutation.isPending;

  const SPECS = [
    { k: "Position X", v: `${Math.round(annotation.position_x * 100)}%` },
    { k: "Position Y", v: `${Math.round(annotation.position_y * 100)}%` },
    { k: "Status", v: isResolved ? "Resolved" : "Open" },
    ...(product?.specs ? Object.entries(product.specs).map(([k, v]) => ({ k, v: String(v) })) : []),
  ];

  return (
    <div className="hm-detail-panel">
      {/* Header */}
      <div className="hm-detail-header">
        <div className="hm-detail-label" style={{ color: isResolved ? "var(--success)" : undefined }}>
          {isResolved ? "✓ Resolved" : "Item detail"}
        </div>
        <button className="hm-close-btn" onClick={onClose}>×</button>
      </div>

      {/* Image */}
      <div className="hm-detail-img">
        {isLoading ? (
          <div className="spinner" />
        ) : annotation.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={annotation.thumbnail_url} alt="Product" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 56, color: "var(--stone-300)" }}>
            {product?.name?.[0] ?? "?"}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="hm-detail-body">
        <div className="hm-detail-name">{product?.name ?? `Annotation #${annotation.id.slice(0, 6)}`}</div>
        {product?.brand && (
          <div className="hm-detail-brand">{product.brand}{product.model ? ` · ${product.model}` : ""}</div>
        )}
        {product?.price != null && (
          <div className="hm-price-chip">฿ {product.price.toLocaleString("th-TH")}</div>
        )}

        <div className="hm-spec-label">Specifications</div>
        {SPECS.map((s) => (
          <div key={s.k} className="hm-spec-row">
            <span className="hm-spec-key">{s.k}</span>
            <span className="hm-spec-val">{String(s.v)}</span>
          </div>
        ))}

        {product?.description && (
          <div className="hm-contact-block">
            <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--stone-500)", marginBottom: 4 }}>
              Description
            </div>
            <div>{product.description}</div>
          </div>
        )}
      </div>

      {/* Footer */}
      {canResolve && (
        <div className="hm-detail-footer">
          {isResolved ? (
            <button
              className="hm-reopen-btn"
              disabled={isBusy}
              onClick={() => { reopenMutation.mutate(annotation.id); onClose(); }}
            >
              {isBusy ? "Processing…" : "↩ Reopen"}
            </button>
          ) : (
            <button
              className="hm-resolve-btn"
              disabled={isBusy}
              onClick={() => { resolveMutation.mutate(annotation.id); onClose(); }}
            >
              {isBusy ? "Processing…" : "✓ Mark as resolved"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
