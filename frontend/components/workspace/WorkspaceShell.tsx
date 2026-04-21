// components/workspace/WorkspaceShell.tsx
"use client";

import { useState, useRef, useCallback } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import {
  useAnnotations,
  useCreateAnnotation,
  useDeleteAnnotation,
  useMoveAnnotation,
} from "@/hooks/useAnnotations";
import { useAnnotationStore, type Annotation } from "@/store/annotationStore";
import { useAuth } from "@/hooks/useAuth";
import { useProjectImages } from "@/hooks/useProjectImages";
import { useLinkProduct, type ProductDetail } from "@/hooks/useProducts";
import { authFetch } from "@/lib/auth";
import { ProductDetailPanel } from "@/components/annotation/ProductDetailPanel";
import { ProductPickerModal } from "@/components/annotation/ProductPickerModal";
import { FanEmojiMenu } from "./FanEmojiMenu";
import { DeleteConfirmPopup } from "./DeleteConfirmPopup";
import { PinsLayer } from "./PinsLayer";
import { ProductGrid } from "./ProductGrid";
import { useSlides } from "@/hooks/useSlides";
import { useImageUpload } from "@/hooks/useImageUpload";

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

interface Props {
  imageId: string;
  imageUrl: string;
  projectId: string;
  forceReadOnly?: boolean;
}

export function WorkspaceShell({ imageId, imageUrl, projectId, forceReadOnly }: Props) {
  const auth = useAuth();
  const qc = useQueryClient();
  const readOnly = forceReadOnly || auth.isReadOnly;

  // ── Slides ────────────────────────────────────────────────────────────────
  const { data: dbImages, refetch: refetchImages } = useProjectImages(projectId);
  const { slides, currentSlide, activeSlide, setCurrentSlide, resetSeed, addLocalSlide, prev, next } =
    useSlides({ initialImageId: imageId, initialImageUrl: imageUrl, dbImages });

  const handleUploadSuccess = useCallback(async () => {
    resetSeed();
    await refetchImages();
  }, [resetSeed, refetchImages]);

  const { uploading, uploadError, uploadFile, submitUrl } = useImageUpload({
    projectId,
    isAuthenticated: auth.isAuthenticated,
    onSuccess: handleUploadSuccess,
  });

  // ── UI state ──────────────────────────────────────────────────────────────
  const [filmExpanded, setFilmExpanded] = useState(false);
  const [refInput, setRefInput] = useState("");
  const [fanVisible, setFanVisible] = useState(false);
  const [fanPos, setFanPos] = useState({ x: 0, y: 0 });
  const [pendingPos, setPendingPos] = useState({ normX: 0, normY: 0 });
  const [deleteTarget, setDeleteTarget] = useState<Annotation | null>(null);
  const [activePinId, setActivePinId] = useState<string | null>(null);
  const [activeProduct, setActiveProduct] = useState<ProductDetail | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  // ── Annotations ───────────────────────────────────────────────────────────
  useAnnotations(activeSlide.imageId);
  const annotations = useAnnotationStore((s) => s.annotationsByImage[activeSlide.imageId] ?? []);
  const createMutation = useCreateAnnotation(activeSlide.imageId, projectId);
  const deleteMutation = useDeleteAnnotation(activeSlide.imageId);
  const linkProduct = useLinkProduct(projectId);
  const moveMutation = useMoveAnnotation(projectId);

  const activeAnnotation = activePinId
    ? annotations.find((a) => a.id === activePinId) ?? null
    : null;

  // ── Canvas long-press to open fan menu ────────────────────────────────────
  const canvasRef = useRef<HTMLDivElement>(null);
  const canvasLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvasTouchStart = useRef<{ x: number; y: number } | null>(null);

  const toNorm = useCallback((clientX: number, clientY: number) => {
    const el = canvasRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      normX: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      normY: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    };
  }, []);

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

  const handleEmojiPick = async (objectId: number) => {
    setFanVisible(false);
    const ann = await createMutation.mutateAsync({
      positionX: pendingPos.normX,
      positionY: pendingPos.normY,
      objectId,
    });
    setActivePinId(ann.id);
    setShowAll(false);
  };

  const handleSlideChange = (idx: number) => {
    setCurrentSlide(idx);
    setActivePinId(null);
    setActiveProduct(null);
    setFilmExpanded(false);
  };

  return (
    <>
      {fanVisible && (
        <FanEmojiMenu pos={fanPos} onPick={handleEmojiPick} onClose={() => setFanVisible(false)} />
      )}

      {deleteTarget && (
        <DeleteConfirmPopup
          annotation={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            deleteMutation.mutate({ annotationId: deleteTarget.id, projectId });
            setDeleteTarget(null);
            if (activePinId === deleteTarget.id) setActivePinId(null);
          }}
        />
      )}

      {pickerOpen && (
        <ProductPickerModal
          projectId={projectId}
          onSelect={async (productId) => {
            await linkProduct.mutateAsync({
              productId,
              objectId: activeAnnotation?.object_id ?? 0,
            });
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {activeProduct && (
        <ProductDetailPanel
          product={activeProduct}
          annotation={activeAnnotation}
          canResolve={auth.canResolve}
          imageId={activeSlide.imageId}
          onClose={() => setActiveProduct(null)}
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
            <div className="hm-wordmark">
              House<span>Mind</span>
            </div>
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
            </div>
          </div>
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
            onSingleTap={(id) => {
              setActivePinId((prev) => (prev === id ? null : id));
              setShowAll(false);
              setActiveProduct(null);
            }}
            onLongPress={(ann) => setDeleteTarget(ann)}
            onMove={(id, normX, normY) => moveMutation.mutate({ id, normX, normY })}
          />

          {createMutation.isPending && (
            <div className="hm-creating">
              <div className="spinner" />
            </div>
          )}

          {slides.length > 1 && (
            <div className="hm-carousel-nav">
              <button className="hm-c-btn" onClick={() => { prev(); setActivePinId(null); setActiveProduct(null); }}>
                ‹
              </button>
              <button className="hm-c-btn" onClick={() => { next(); setActivePinId(null); setActiveProduct(null); }}>
                ›
              </button>
            </div>
          )}

          {/* Filmstrip */}
          <div className={`hm-filmstrip ${filmExpanded ? "expanded" : "collapsed"}`}>
            <div className="hm-tray-row">
              {slides.map((s, i) => (
                <div
                  key={s.imageId}
                  className={`hm-film-thumb ${i === currentSlide ? "active" : ""}`}
                  onClick={() => handleSlideChange(i)}
                >
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
                  <label
                    className="hm-tray-file-btn"
                    style={{ opacity: uploading || !auth.isAuthenticated ? 0.5 : 1 }}
                  >
                    📁 {uploading ? "Uploading…" : "Upload image"}
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadFile(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <div style={{ flex: 1 }} />
                  <button
                    className="hm-tray-close"
                    onClick={() => {
                      setFilmExpanded(false);
                      setRefInput("");
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
                    onChange={(e) => setRefInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        submitUrl(refInput, (url) => {
                          addLocalSlide(url);
                          setRefInput("");
                          setFilmExpanded(false);
                        });
                      }
                    }}
                  />
                  <button
                    className="hm-tray-submit"
                    onClick={() =>
                      submitUrl(refInput, (url) => {
                        addLocalSlide(url);
                        setRefInput("");
                        setFilmExpanded(false);
                      })
                    }
                  >
                    Add
                  </button>
                </div>
                {uploadError && <div className="hm-upload-error">⚠ {uploadError}</div>}
              </div>
            )}
          </div>
        </div>

        <ProductGrid
          projectId={projectId}
          activeAnnotation={activeAnnotation}
          showAll={showAll}
          canAttach={!readOnly && auth.canWrite}
          onShowAllToggle={() => setShowAll((v) => !v)}
          onAttachProduct={() => setPickerOpen(true)}
          onProductClick={(p) => setActiveProduct(p)}
        />
      </div>
    </>
  );
}