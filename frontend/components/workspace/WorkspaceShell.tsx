"use client";

// components/workspace/WorkspaceShell.tsx — HouseMind
// Long press empty canvas → fan emoji menu → create annotation → panel opens
// Single tap pin → product panel
// Long press pin → delete confirmation

import { useState, useRef, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAnnotations,
  useCreateAnnotation,
  useDeleteAnnotation,
  useResolveAnnotation,
  useReopenAnnotation,
} from "@/hooks/useAnnotations";
import { useAnnotationStore, type Annotation } from "@/store/annotationStore";
import { useAuth } from "@/hooks/useAuth";
import { useProjectImages } from "@/hooks/useProjectImages";
import { useProjectProducts, useLinkProduct } from "@/hooks/useProducts";
import { authFetch } from "@/lib/auth";
import { ProductDetailPanel } from "@/components/annotation/ProductDetailPanel";
import { ProductPickerModal } from "@/components/annotation/ProductPickerModal";

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

// Object ID to emoji + label mapping — edit here to change icons
const OBJECT_DEFS: Record<number, { emoji: string; label: string }> = {
  101: { emoji: "😊", label: "Smile" },
  102: { emoji: "⭐", label: "Star" },
  103: { emoji: "❤️", label: "Heart" },
  104: { emoji: "📷", label: "Camera" },
  105: { emoji: "🌿", label: "Leaf" },
  106: { emoji: "🗺️", label: "Map" },
  107: { emoji: "💵", label: "Dollar" },
  108: { emoji: "🏷️", label: "Tag" },
};
const OBJECT_IDS = Object.keys(OBJECT_DEFS).map(Number);

interface Slide { imageId: string; url: string; label: string; }

interface Props {
  imageId: string;
  imageUrl: string;
  projectId: string;
  forceReadOnly?: boolean;
}

const PIN_COLORS = ["#7F77DD", "#C9A84C", "#639922", "#E24B4A", "#888780", "#534AB7", "#C05A30", "#3B6D11"];

export function WorkspaceShell({ imageId, imageUrl, projectId, forceReadOnly }: Props) {
  const auth = useAuth();
  const readOnly = forceReadOnly || auth.isReadOnly;
  const qc = useQueryClient();

  // ── Slides ────────────────────────────────────────────────────────────────
  const [slides, setSlides] = useState<Slide[]>([{ imageId, url: imageUrl, label: "Reference 1" }]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const activeSlide = slides[currentSlide];
  const seededFromDb = useRef(false);
  const { data: dbImages, refetch: refetchImages } = useProjectImages(projectId);

  useEffect(() => {
    if (seededFromDb.current || !dbImages || dbImages.length === 0) return;
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

  // ── UI state ──────────────────────────────────────────────────────────────
  const [filmExpanded, setFilmExpanded] = useState(false);
  const [refInput, setRefInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  // Fan menu state
  const [fanVisible, setFanVisible] = useState(false);
  const [fanPos, setFanPos] = useState({ x: 0, y: 0 });
  const [pendingPos, setPendingPos] = useState({ normX: 0, normY: 0 });

  // Delete confirm state
  const [deleteTarget, setDeleteTarget] = useState<Annotation | null>(null);

  // Active pin for product panel
  const [activePinId, setActivePinId] = useState<string | null>(null);

  // Product picker modal
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showAllProducts, setShowAllProducts] = useState(false);

  // ── Annotations ───────────────────────────────────────────────────────────
  useAnnotations(activeSlide.imageId);
  const annotations = useAnnotationStore((s) => s.annotationsByImage[activeSlide.imageId] ?? []);
  const createMutation = useCreateAnnotation(activeSlide.imageId, projectId);
  const deleteMutation = useDeleteAnnotation(activeSlide.imageId);
  const linkProduct = useLinkProduct(projectId);

  const activeAnnotation = activePinId
    ? annotations.find((a) => a.id === activePinId) ?? null
    : null;

  // ── Canvas helpers ────────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLDivElement>(null);

  const toNorm = useCallback((clientX: number, clientY: number) => {
    const el = canvasRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      normX: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      normY: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    };
  }, []);

  // Long press on empty canvas
  const canvasLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvasTouchStart = useRef<{ x: number; y: number } | null>(null);

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (readOnly || !auth.isAuthenticated) return;
    canvasTouchStart.current = { x: e.clientX, y: e.clientY };
    canvasLongPressTimer.current = setTimeout(() => {
      const norm = toNorm(e.clientX, e.clientY);
      if (!norm) return;
      setPendingPos(norm);
      setFanPos({ x: e.clientX, y: e.clientY });
      setFanVisible(true);
    }, 600);
  };

  const handleCanvasPointerUp = () => {
    if (canvasLongPressTimer.current) {
      clearTimeout(canvasLongPressTimer.current);
      canvasLongPressTimer.current = null;
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = canvasTouchStart.current;
    if (!start) return;
    const moved = Math.abs(e.clientX - start.x) > 8 || Math.abs(e.clientY - start.y) > 8;
    if (moved && canvasLongPressTimer.current) {
      clearTimeout(canvasLongPressTimer.current);
      canvasLongPressTimer.current = null;
    }
  };

  // Pick emoji from fan menu
  const handleEmojiPick = async (objectId: number) => {
    setFanVisible(false);
    const ann = await createMutation.mutateAsync({
      positionX: pendingPos.normX,
      positionY: pendingPos.normY,
      objectId,
    });
    setActivePinId(ann.id);
  };

  // Image upload
  const handleFileUpload = async (file: File) => {
    if (!auth.isAuthenticated) { setUploadError("Sign in to upload."); return; }
    setUploading(true); setUploadError("");
    try {
      const presignRes = await authFetch(`${API}/images/upload-url?project_id=${projectId}`, {
        method: "POST",
        body: JSON.stringify({ project_id: projectId, filename: file.name, content_type: file.type }),
      });
      if (!presignRes.ok) throw new Error("Could not get upload URL");
      const { upload_url, s3_key } = await presignRes.json();
      const s3Res = await fetch(upload_url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!s3Res.ok) throw new Error("S3 upload failed");
      const confirmRes = await authFetch(`${API}/images/confirm?project_id=${projectId}`, {
        method: "POST",
        body: JSON.stringify({ project_id: projectId, s3_key, original_filename: file.name, mime_type: file.type }),
      });
      if (!confirmRes.ok) throw new Error("Confirmation failed");
      seededFromDb.current = false;
      await refetchImages();
      setFilmExpanded(false);
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const submitRef = async () => {
    const url = refInput.trim();
    if (!url) return;
    if (auth.isAuthenticated) {
      try {
        const res = await authFetch(`${API}/images/from-url?project_id=${projectId}`, {
          method: "POST",
          body: JSON.stringify({ project_id: projectId, url, original_filename: url.split("/").pop() }),
        });
        if (res.ok) {
          seededFromDb.current = false;
          await refetchImages();
          setRefInput(""); setFilmExpanded(false);
          return;
        }
      } catch { /* fall through */ }
    }
    const idx = slides.length;
    setSlides((prev) => [...prev, { imageId: `local-${idx}`, url, label: `Reference ${idx + 1} (session)` }]);
    setCurrentSlide(idx);
    setRefInput(""); setFilmExpanded(false);
  };

  // Get object_id of active annotation for filtering products
  const activeObjectId = activeAnnotation?.object_id ?? null;
  // Unique object_ids visible on current image
  const visibleObjectIds = [...new Set(annotations.map((a) => a.object_id))];

  return (
    <>
      {/* Fan emoji menu */}
      {fanVisible && (
        <FanEmojiMenu
          pos={fanPos}
          onPick={handleEmojiPick}
          onClose={() => setFanVisible(false)}
        />
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <DeleteConfirmPopup
          annotation={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            deleteMutation.mutate(deleteTarget.id);
            setDeleteTarget(null);
            if (activePinId === deleteTarget.id) setActivePinId(null);
          }}
        />
      )}

      {/* Product picker modal */}
      {pickerOpen && (
        <ProductPickerModal
          projectId={projectId}
          onSelect={async (productId) => {
            await linkProduct.mutateAsync(productId);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}

      <div className="hm-app">
        {!auth.isAuthenticated && (
          <div className="hm-no-auth">
            Not signed in — annotations won&apos;t save.{" "}
            <a href="/login">Sign in →</a>
          </div>
        )}

        <div className="hm-hero-bar">
          <div>
            <div className="hm-wordmark">House<span>Mind</span></div>
            <div className="hm-hero-sub">Visual decisions workspace</div>
          </div>
          <a href="/login" style={{ textDecoration: "none" }}>
            <button className="hm-role-badge">{auth.role ?? "Sign in"}</button>
          </a>
        </div>

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
            <button className="hm-add-btn" onClick={() => setPickerOpen(true)}>+ Attach Product</button>
          )}
        </div>

        {/* Canvas */}
        <div className="hm-canvas-wrap">
          {activeSlide.url && (
            <img className="hm-canvas-img" src={activeSlide.url} alt={activeSlide.label} />
          )}

          <div
            ref={canvasRef}
            className="hm-canvas-tap"
            onPointerDown={handleCanvasPointerDown}
            onPointerUp={handleCanvasPointerUp}
            onPointerMove={handleCanvasPointerMove}
            onPointerLeave={handleCanvasPointerUp}
          />

          {annotations.length === 0 && !readOnly && (
            <div className="hm-canvas-hint">
              {auth.isAuthenticated ? "Hold to annotate" : "Sign in to annotate"}
            </div>
          )}

          <PinsLayer
            annotations={annotations}
            activeId={activePinId}
            onSingleTap={(id) => setActivePinId((prev) => prev === id ? null : id)}
            onLongPress={(ann) => setDeleteTarget(ann)}
          />

          {createMutation.isPending && (
            <div className="hm-creating"><div className="spinner" /></div>
          )}

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
                <div key={s.imageId} className={`hm-film-thumb ${i === currentSlide ? "active" : ""}`}
                  onClick={() => { setCurrentSlide(i); setFilmExpanded(false); }}>
                  {s.url && <img src={s.url} alt={s.label} />}
                  <span style={{ position: "relative", zIndex: 1 }}>{i + 1}</span>
                </div>
              ))}
              <button className="hm-film-add" onClick={() => setFilmExpanded((v) => !v)}>
                <span className="hm-film-add-icon">+</span>
                <span className="hm-film-add-label">Add</span>
              </button>
            </div>
            {filmExpanded && (
              <div className="hm-tray-upload-row">
                <div className="hm-tray-input-row">
                  <label className="hm-tray-file-btn" style={{ opacity: (uploading || !auth.isAuthenticated) ? 0.5 : 1 }}>
                    📁 {uploading ? "Uploading…" : "Upload image"}
                    <input type="file" accept="image/*" style={{ display: "none" }}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = ""; }} />
                  </label>
                  <div style={{ flex: 1 }} />
                  <button className="hm-tray-close" onClick={() => { setFilmExpanded(false); setRefInput(""); setUploadError(""); }}>×</button>
                </div>
                <div className="hm-tray-input-row">
                  <input className="hm-tray-input" placeholder="Or paste image URL…" value={refInput}
                    onChange={(e) => setRefInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitRef()} />
                  <button className="hm-tray-submit" onClick={submitRef}>Add</button>
                </div>
                {uploadError && <div className="hm-upload-error">⚠ {uploadError}</div>}
              </div>
            )}
          </div>
        </div>

        {/* Product panel — shows when pin selected */}
        {activeAnnotation && (
          <ProductDetailPanel
            annotation={activeAnnotation}
            projectId={projectId}
            canAttach={!readOnly && auth.canWrite}
            canResolve={auth.canResolve}
            imageId={activeSlide.imageId}
            onClose={() => setActivePinId(null)}
            onAttachProduct={() => setPickerOpen(true)}
          />
        )}

        {/* Product grid — all visible products */}
        {!activeAnnotation && (
          <>
            <div className="hm-section-header">
              <div className="hm-section-title">
                {showAllProducts ? "All Project Products" : "Products"}
              </div>
              <button
                style={{ fontSize: 11, color: "var(--color-accent)", background: "none", border: "none", cursor: "pointer" }}
                onClick={() => setShowAllProducts((v) => !v)}
              >
                {showAllProducts ? "Filter by pin" : "Show all"}
              </button>
            </div>
            <ProductGrid
              projectId={projectId}
              objectIds={showAllProducts ? null : visibleObjectIds}
              annotations={annotations}
            />
          </>
        )}
      </div>
    </>
  );
}

// ── Fan emoji menu ────────────────────────────────────────────────────────────

function FanEmojiMenu({
  pos,
  onPick,
  onClose,
}: {
  pos: { x: number; y: number };
  onPick: (objectId: number) => void;
  onClose: () => void;
}) {
  // 8 items fanned in a semicircle above the press point
  const radius = 72;
  const startAngle = 180; // left
  const endAngle = 360;   // right (upper half)
  const count = OBJECT_IDS.length;

  return (
    <>
      {/* backdrop */}
      <div
        style={{ position: "fixed", inset: 0, zIndex: 100 }}
        onClick={onClose}
      />
      <div style={{ position: "fixed", left: pos.x, top: pos.y, zIndex: 101, transform: "translate(-50%, -50%)" }}>
        {OBJECT_IDS.map((objectId, i) => {
          const angle = startAngle + (i / (count - 1)) * (endAngle - startAngle);
          const rad = (angle * Math.PI) / 180;
          const x = Math.cos(rad) * radius;
          const y = Math.sin(rad) * radius;
          const def = OBJECT_DEFS[objectId];
          return (
            <button
              key={objectId}
              onClick={() => onPick(objectId)}
              title={def.label}
              style={{
                position: "absolute",
                left: x,
                top: y,
                transform: "translate(-50%, -50%)",
                width: 42,
                height: 42,
                borderRadius: "50%",
                background: "#fff",
                border: "2px solid #555",
                fontSize: 20,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                transition: "transform 0.15s",
                zIndex: 102,
              }}
            >
              {def.emoji}
            </button>
          );
        })}
        {/* center dot */}
        <div style={{
          position: "absolute", left: 0, top: 0,
          transform: "translate(-50%, -50%)",
          width: 16, height: 16, borderRadius: "50%",
          background: "#555",
        }} />
      </div>
    </>
  );
}

// ── Delete confirm popup ──────────────────────────────────────────────────────

function DeleteConfirmPopup({
  annotation,
  onCancel,
  onConfirm,
}: {
  annotation: Annotation;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const def = OBJECT_DEFS[annotation.object_id];
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "#fff", borderRadius: 16, padding: "24px 24px 20px",
        width: 280, boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
      }}>
        <div style={{ fontSize: 32, textAlign: "center", marginBottom: 12 }}>
          {def?.emoji ?? "📍"}
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, textAlign: "center", marginBottom: 4 }}>
          Delete annotation?
        </div>
        <div style={{ fontSize: 12, color: "#888", textAlign: "center", marginBottom: 20 }}>
          {def?.label ?? "Pin"} · {Math.round(annotation.position_x * 100)}%, {Math.round(annotation.position_y * 100)}%
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, height: 40, borderRadius: 10,
              border: "0.5px solid #ddd", background: "#f5f5f5",
              fontSize: 13, cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1, height: 40, borderRadius: 10,
              border: "none", background: "#E24B4A",
              color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Pins layer ────────────────────────────────────────────────────────────────

function PinsLayer({
  annotations,
  activeId,
  onSingleTap,
  onLongPress,
}: {
  annotations: Annotation[];
  activeId: string | null;
  onSingleTap: (id: string) => void;
  onLongPress: (ann: Annotation) => void;
}) {
  const timerRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const startPos = useRef<Record<string, { x: number; y: number }>>({});

  return <>
    {annotations.map((ann, i) => {
      const isActive = ann.id === activeId;
      const color = PIN_COLORS[i % PIN_COLORS.length];
      const def = OBJECT_DEFS[ann.object_id];

      return (
        <div
          key={ann.id}
          className="hm-pin"
          style={{ left: `${ann.position_x * 100}%`, top: `${ann.position_y * 100}%` }}
          onPointerDown={(e) => {
            e.stopPropagation();
            startPos.current[ann.id] = { x: e.clientX, y: e.clientY };
            timerRefs.current[ann.id] = setTimeout(() => {
              onLongPress(ann);
            }, 600);
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            const start = startPos.current[ann.id];
            const moved = start
              ? Math.abs(e.clientX - start.x) > 6 || Math.abs(e.clientY - start.y) > 6
              : false;
            if (timerRefs.current[ann.id]) {
              clearTimeout(timerRefs.current[ann.id]);
              if (!moved) onSingleTap(ann.id);
            }
          }}
          onPointerLeave={() => clearTimeout(timerRefs.current[ann.id])}
        >
          <div
            className={`hm-pin-bubble ${isActive ? "active" : ""}`}
            style={{ background: color, fontSize: 16 }}
          >
            <div className="hm-pin-inner">{def?.emoji ?? "📍"}</div>
          </div>
          <div className="hm-pin-tail" />
        </div>
      );
    })}
  </>;
}

// ── Product grid ──────────────────────────────────────────────────────────────

function ProductGrid({
  projectId,
  objectIds,
  annotations,
}: {
  projectId: string;
  objectIds: number[] | null;
  annotations: Annotation[];
}) {
  const { data: allProducts = [] } = useProjectProducts(projectId);

  // If filtering, keep only products whose object matches visible annotations
  // Since object_products doesn't store object_id, we show all project products
  // when objectIds is null (show all), or all of them when objectIds present
  // (future: can filter by tagging products with object_id if needed)
  const products = allProducts;

  if (products.length === 0) {
    return (
      <div style={{ padding: "40px 20px", textAlign: "center", color: "#888", fontSize: 13 }}>
        No products yet — attach one via a pin
      </div>
    );
  }

  return (
    <div className="hm-product-grid">
      {products.map((p, i) => (
        <div key={p.id} className="hm-prod-card">
          <div className="hm-prod-img">
            {p.thumbnail_url
              ? <img src={p.thumbnail_url} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <div className="hm-prod-letter">{p.name[0]}</div>
            }
          </div>
          <div className="hm-prod-title">{p.name}</div>
          {p.brand && <div className="hm-prod-tag">{p.brand}</div>}
          {p.price != null && (
            <div className="hm-prod-contact">฿{p.price.toLocaleString("th-TH")}</div>
          )}
        </div>
      ))}
    </div>
  );
}