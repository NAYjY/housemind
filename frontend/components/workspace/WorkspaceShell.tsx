"use client";

// components/workspace/WorkspaceShell.tsx
// Fixes applied:
//   - Loads images from DB via useProjectImages on mount
//   - Guards canvas mutations with auth.isAuthenticated (no redirect if not logged in)
//   - File upload persists to DB via presign → S3 → confirm flow
//   - URL paste remains session-only (clearly labelled)

import { useState, useRef, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAnnotations,
  useCreateAnnotation,
  useDeleteAnnotation,
  useResolveAnnotation,
  useReopenAnnotation,
  useProductDetail,
} from "@/hooks/useAnnotations";
import { useAnnotationStore, type Annotation } from "@/store/annotationStore";
import { useAuth } from "@/hooks/useAuth";
import { useProjectImages } from "@/hooks/useProjectImages";
import { authFetch } from "@/lib/auth";

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

interface Slide { imageId: string; url: string; label: string; }

interface Props {
  imageId: string;
  imageUrl: string;
  projectId: string;
  forceReadOnly?: boolean;
}

const PIN_COLORS = ["#7F77DD", "#C9A84C", "#639922", "#E24B4A", "#888780", "#534AB7"];

export function WorkspaceShell({ imageId, imageUrl, projectId, forceReadOnly }: Props) {
  const auth = useAuth();
  const readOnly = forceReadOnly || auth.isReadOnly;
  const qc = useQueryClient();

  // ── Slides state (seeded from DB, falls back to URL param) ──────────────
  const [slides, setSlides] = useState<Slide[]>([
    { imageId, url: imageUrl, label: "Reference 1" },
  ]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const activeSlide = slides[currentSlide];
  const seededFromDb = useRef(false);

  const { data: dbImages, refetch: refetchImages } = useProjectImages(projectId);

  useEffect(() => {
    if (seededFromDb.current) return;
    if (!dbImages || dbImages.length === 0) return;
    seededFromDb.current = true;
    const dbSlides: Slide[] = dbImages.map((img, i) => ({
      imageId: img.id,
      url: img.url ?? "",
      label: img.original_filename ?? `Reference ${i + 1}`,
    }));
    setSlides(dbSlides);
    const idx = dbSlides.findIndex((s) => s.imageId === imageId);
    setCurrentSlide(idx >= 0 ? idx : 0);
  }, [dbImages, imageId]);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [filmExpanded, setFilmExpanded]       = useState(false);
  const [refInput, setRefInput]               = useState("");
  const [uploading, setUploading]             = useState(false);
  const [uploadError, setUploadError]         = useState("");
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  // const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Annotations ───────────────────────────────────────────────────────────
  useAnnotations(activeSlide.imageId);
  const annotations   = useAnnotationStore((s) => s.annotationsByImage[activeSlide.imageId] ?? []);
  const createMutation = useCreateAnnotation(activeSlide.imageId, projectId);
  const deleteMutation = useDeleteAnnotation(activeSlide.imageId);

  const activeAnnotation = activeAnnotationId
    ? annotations.find((a) => a.id === activeAnnotationId) ?? null
    : null;

  // ── Canvas helpers ────────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLDivElement>(null);

  const toNorm = useCallback((clientX: number, clientY: number) => {
    const el = canvasRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    };
  }, []);

  // Guard: only call mutation when authenticated to prevent 401 redirect
  const createAt = useCallback(
    (clientX: number, clientY: number) => {
      if (readOnly) return;
      if (!auth.isAuthenticated) return;
      const norm = toNorm(clientX, clientY);
      if (!norm) return;
      createMutation.mutate({ positionX: norm.x, positionY: norm.y });
    },
    [readOnly, auth.isAuthenticated, toNorm, createMutation],
  );

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (activeAnnotationId) { setActiveAnnotationId(null); return; }
    createAt(e.clientX, e.clientY);
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.target !== e.currentTarget) return;
    createAt(e.clientX, e.clientY);
  };

  // ── Image upload — presign → S3 PUT → confirm ─────────────────────────────
  const handleFileUpload = async (file: File) => {
    if (!auth.isAuthenticated) {
      setUploadError("Sign in to upload images.");
      return;
    }
    setUploading(true);
    setUploadError("");
    try {
      // Step 1: get presigned PUT URL from backend
      const presignRes = await authFetch(`${API}/images/upload-url?project_id=${projectId}`, {
        method: "POST",
        body: JSON.stringify({
          project_id: projectId,
          filename: file.name,
          content_type: file.type,
        }),
      });
      if (!presignRes.ok) throw new Error("Could not get upload URL");
      const { upload_url, s3_key } = await presignRes.json();

      // Step 2: PUT file directly to S3
      const s3Res = await fetch(upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!s3Res.ok) throw new Error("S3 upload failed");

      // Step 3: confirm with backend so DB record is created
      const confirmRes = await authFetch(`${API}/images/confirm?project_id=${projectId}`, {
        method: "POST",
        body: JSON.stringify({
          project_id: projectId,
          s3_key,
          original_filename: file.name,
          mime_type: file.type,
        }),
      });
      if (!confirmRes.ok) throw new Error("Upload confirmation failed");

      // Refresh slide list from DB
      seededFromDb.current = false;
      await refetchImages();
      setFilmExpanded(false);
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  // Session-only URL paste (no DB, disappears on refresh — shown in UI)
const submitRef = async () => {
    const url = refInput.trim();
    if (!url) return;
    if (auth.isAuthenticated) {
      // Persist to DB
      try {
        const res = await authFetch(`${API}/images/from-url?project_id=${projectId}`, {
          method: "POST",
          body: JSON.stringify({
            project_id: projectId,
            url,
            original_filename: url.split("/").pop() ?? "reference",
          }),
        });
        if (res.ok) {
          seededFromDb.current = false;
          await refetchImages();
          setRefInput("");
          setFilmExpanded(false);
          return;
        }
      } catch {
        // fall through to session-only
      }
    }
    const idx = slides.length;
    setSlides((prev) => [...prev, { imageId: `local-${idx}`, url, label: `Reference ${idx + 1} (session)` }]);
    setCurrentSlide(idx);
    setRefInput("");
    setFilmExpanded(false);
  };

  return (
    <>
      

      {/* Hidden file input — triggered by upload button */}
      {/* <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileUpload(file);
          e.target.value = ""; // reset so same file can be re-selected
        }}
      /> */}

      <div className="hm-app">
        {/* Not logged in warning */}
        {!auth.isAuthenticated && (
          <div className="hm-no-auth">
            Not signed in — annotations won&apos;t save.{" "}
            <a href="/login">Sign in →</a>
          </div>
        )}

        {/* Hero bar */}
        <div className="hm-hero-bar">
          <div>
            <div className="hm-wordmark">House<span>Mind</span></div>
            <div className="hm-hero-sub">Visual decisions workspace</div>
          </div>
          <a href="/login" style={{ textDecoration: "none" }}>
            <button className="hm-role-badge">
              {auth.role ?? "Sign in"}
            </button>
          </a>
        </div>

        {/* Project nav */}
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
            <button className="hm-add-btn">+ Add item</button>
          )}
        </div>

        {/* Canvas */}
        <div className="hm-canvas-wrap">
          {activeSlide.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="hm-canvas-img" src={activeSlide.url} alt={activeSlide.label} />
          )}

          {/* Tap zone — z-index:5, BELOW pins */}
          <div
            ref={canvasRef}
            className="hm-canvas-tap"
            onClick={handleCanvasClick}
            onContextMenu={handleContextMenu}
          />

          {/* Hint */}
          {annotations.length === 0 && !readOnly && (
            <div className="hm-canvas-hint">
              {auth.isAuthenticated
                ? "Click to annotate"
                : "Sign in to annotate"}
            </div>
          )}

          {/* Pins — z-index:15, ABOVE tap zone */}
          <PinsLayer
            annotations={annotations}
            activeId={activeAnnotationId}
            onSelect={(id) => setActiveAnnotationId(id)}
            onDelete={readOnly ? undefined : (id) => deleteMutation.mutate(id)}
          />

          {(createMutation.isPending || uploading) && (
            <div className="hm-creating"><div className="spinner" /></div>
          )}

          {/* Carousel nav */}
          {slides.length > 1 && (
            <div className="hm-carousel-nav">
              <button className="hm-c-btn" onClick={() => setCurrentSlide((i) => (i - 1 + slides.length) % slides.length)}>‹</button>
              <button className="hm-c-btn" onClick={() => setCurrentSlide((i) => (i + 1) % slides.length)}>›</button>
            </div>
          )}

          {/* Filmstrip */}
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
              <button className="hm-film-add" onClick={() => setFilmExpanded((v) => !v)}>
                <span className="hm-film-add-icon">+</span>
                <span className="hm-film-add-label">Add</span>
              </button>
              <span className="hm-tray-hint">Filmstrip</span>
            </div>

            {filmExpanded && (
              <div className="hm-tray-upload-row">
                {/* Row 1: file upload (persists to DB) + close */}
                <div className="hm-tray-input-row">
                  <label className="hm-tray-file-btn" style={{ opacity: (uploading || !auth.isAuthenticated) ? 0.5 : 1, pointerEvents: (uploading || !auth.isAuthenticated) ? "none" : "auto" }}>
                    📁 {uploading ? "Uploading…" : "Upload image"}
                    <input
                      id="filmstrip-file-upload"
                      name="filmstrip-file-upload"
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <div style={{ flex: 1 }} />
                  <button className="hm-tray-close" onClick={() => { setFilmExpanded(false); setRefInput(""); setUploadError(""); }}>×</button>
                </div>
                {/* Row 2: URL paste (session-only) */}
                <div className="hm-tray-input-row">
                  <input
                    className="hm-tray-input"
                    placeholder="Or paste image URL (session only)…"
                    value={refInput}
                    onChange={(e) => setRefInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitRef()}
                  />
                  <button className="hm-tray-submit" onClick={submitRef}>Add</button>
                </div>
                {uploadError && <div className="hm-upload-error">⚠ {uploadError}</div>}
                <div className="hm-upload-note">Uploaded files persist · Pasted URLs are session-only</div>
              </div>
            )}
          </div>
        </div>

        {/* Product section */}
        <div className="hm-section-header">
          <div className="hm-section-title">Referenced Items</div>
          <div className="hm-item-count">{annotations.length} {annotations.length === 1 ? "item" : "items"}</div>
        </div>
        <div className="hm-product-grid">
          {annotations.map((ann, i) => (
            <AnnotationCard
              key={ann.id}
              annotation={ann}
              index={i}
              readOnly={readOnly}
              onClick={() => setActiveAnnotationId(ann.id)}
              onDelete={() => deleteMutation.mutate(ann.id)}
            />
          ))}
          {annotations.length === 0 && (
            <div style={{ gridColumn: "1/-1", padding: "40px 0", textAlign: "center", color: "var(--stone-300)", fontFamily: "'DM Serif Display',serif", fontSize: 15 }}>
              {auth.isAuthenticated
                ? "Click the canvas above to add annotations"
                : "Sign in to add annotations"}
            </div>
          )}
        </div>

        {/* Detail panel */}
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

// ── Pins layer ────────────────────────────────────────────────────────────────

function PinsLayer({ annotations, activeId, onSelect, onDelete }: {
  annotations: Annotation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  const timerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  return <>
    {annotations.map((ann, i) => {
      const isActive = ann.id === activeId;
      const color = PIN_COLORS[i % PIN_COLORS.length];

      return (
        <div
          key={ann.id}
          className="hm-pin"
          style={{ left: `${ann.position_x * 100}%`, top: `${ann.position_y * 100}%` }}
          onClick={(e) => { e.stopPropagation(); onSelect(ann.id); }}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onDelete?.(ann.id); }}
          onPointerDown={(e) => {
            e.stopPropagation();
            timerRef.current[ann.id] = setTimeout(() => { onDelete?.(ann.id); }, 600);
          }}
          onPointerUp={(e) => { e.stopPropagation(); clearTimeout(timerRef.current[ann.id]); }}
          onPointerLeave={() => clearTimeout(timerRef.current[ann.id])}
        >
          <div className={`hm-pin-bubble ${isActive ? "active" : ""}`} style={{ background: color }}>
            <div className="hm-pin-inner">{i + 1}</div>
          </div>
          <div className="hm-pin-tail" />
        </div>
      );
    })}
  </>;
}

// ── Annotation card ───────────────────────────────────────────────────────────

const LETTERS = "MFBCAVDKSPRTZWQJYING";

function AnnotationCard({ annotation, index, readOnly, onClick, onDelete }: {
  annotation: Annotation; index: number; readOnly: boolean;
  onClick: () => void; onDelete: () => void;
}) {
  const color = PIN_COLORS[index % PIN_COLORS.length];
  const isResolved = !!annotation.resolved_at;

  return (
    <div className="hm-prod-card" onClick={onClick}>
      {!readOnly && (
        <button className="hm-prod-del" onClick={(e) => { e.stopPropagation(); onDelete(); }}>×</button>
      )}
      <div className="hm-prod-img">
        {annotation.thumbnail_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={annotation.thumbnail_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <div className="hm-prod-letter">{LETTERS[index % LETTERS.length]}</div>
        }
      </div>
      <div className="hm-prod-title">Annotation #{index + 1}</div>
      <div className="hm-prod-tag" style={{ color }}>#{index} {isResolved ? "✓" : "○"}</div>
      {isResolved && <div className="hm-resolved-badge">✓ Resolved</div>}
      <div className="hm-prod-contact">
        {Math.round(annotation.position_x * 100)}%, {Math.round(annotation.position_y * 100)}%
      </div>
    </div>
  );
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function DetailPanel({ annotation, canResolve, imageId, onClose }: {
  annotation: Annotation; canResolve: boolean; imageId: string; onClose: () => void;
}) {
  const { data: product, isLoading } = useProductDetail(annotation.linked_product_id);
  const resolveMutation = useResolveAnnotation(imageId);
  const reopenMutation  = useReopenAnnotation(imageId);
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
      <div className="hm-detail-header">
        <div className="hm-detail-label" style={{ color: isResolved ? "var(--success)" : undefined }}>
          {isResolved ? "✓ Resolved" : "Item detail"}
        </div>
        <button className="hm-close-btn" onClick={onClose}>×</button>
      </div>
      <div className="hm-detail-img">
        {isLoading ? <div className="spinner" />
          : annotation.thumbnail_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={annotation.thumbnail_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 56, color: "var(--stone-300)" }}>
                {LETTERS[0]}
              </div>
        }
      </div>
      <div className="hm-detail-body">
        <div className="hm-detail-name">{product?.name ?? `Pin #${annotation.id.slice(0, 6)}`}</div>
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
            <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--stone-500)", marginBottom: 4 }}>Description</div>
            <div>{product.description}</div>
          </div>
        )}
      </div>
      {canResolve && (
        <div className="hm-detail-footer">
          {isResolved
            ? <button className="hm-reopen-btn" disabled={isBusy} onClick={() => { reopenMutation.mutate(annotation.id); onClose(); }}>
                {isBusy ? "Processing…" : "↩ Reopen"}
              </button>
            : <button className="hm-resolve-btn" disabled={isBusy} onClick={() => { resolveMutation.mutate(annotation.id); onClose(); }}>
                {isBusy ? "Processing…" : "✓ Mark as resolved"}
              </button>
          }
        </div>
      )}
    </div>
  );
}