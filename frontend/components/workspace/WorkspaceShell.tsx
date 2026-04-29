// components/workspace/WorkspaceShell.tsx
"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAnnotations,
  useCreateAnnotation,
  useDeleteAnnotation,
  useMoveAnnotation,
} from "@/hooks/useAnnotations";
import { useAnnotationStore, type Annotation } from "@/store/annotationStore";
import { useAuth } from "@/hooks/useAuth";
import { useProjectImages, useDeleteProjectImage } from "@/hooks/useProjectImages";
import { useLinkProduct, type ProductDetail } from "@/hooks/useProducts";
import { useProjectDetail, useCreateSubProject, useDeleteSubProject } from "@/hooks/useProjects";
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

// ── Subproject Nav Dropdown ───────────────────────────────────────────────────

interface SubprojectNavProps {
  projectId: string;
  isShell: boolean; // true = this IS the main project (shell mode)
}

function SubprojectNav({ projectId, isShell }: SubprojectNavProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");
  const [deleteSubTarget, setDeleteSubTarget] = useState<{ id: string; name: string } | null>(null);

  const { data: currentProject } = useProjectDetail(projectId);
  const parentId = isShell ? projectId : (currentProject?.parent_project_id ?? null);
  const { data: parentDetail, refetch: refetchParent } = useProjectDetail(parentId ?? "");
  const createSub = useCreateSubProject(parentId ?? "");
  const deleteSub = useDeleteSubProject(parentId ?? "");

  const subprojects = parentDetail?.subprojects ?? [];
  const parentName = parentDetail?.name ?? "";
  const currentLabel = isShell ? (parentDetail?.name ?? "…") : (currentProject?.name ?? "…");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setFormError("");
    try {
      const created = await createSub.mutateAsync({
        name: newName.trim(),
        description: newDesc.trim() || undefined,
      });
      await refetchParent();
      setNewName("");
      setNewDesc("");
      setShowAddForm(false);
      setOpen(false);
      router.push(`/th/workspace/${created.id}/${created.id}`);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ position: "relative" }}>

      {/* Delete confirm — fixed overlay, outside button and dropdown */}
      {deleteSubTarget && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 500,
            background: "rgba(0,0,0,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div style={{
            background: "#fff", borderRadius: 16, padding: "24px 24px 20px",
            width: 300, boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
          }}>
            <div style={{ fontSize: 32, textAlign: "center", marginBottom: 12 }}>🗑️</div>
            <div style={{ fontSize: 14, fontWeight: 600, textAlign: "center", marginBottom: 4 }}>
              ลบ "{deleteSubTarget.name}"?
            </div>
            <div style={{ fontSize: 12, color: "#888", textAlign: "center", marginBottom: 10, lineHeight: 1.5 }}>
              รูปภาพและ annotation ทั้งหมดจะถูกลบด้วย
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button
                onClick={() => setDeleteSubTarget(null)}
                style={{ flex: 1, height: 40, borderRadius: 10, border: "0.5px solid #ddd", background: "#f5f5f5", fontSize: 13, cursor: "pointer" }}
              >
                ยกเลิก
              </button>
              <button
                onClick={async () => {
                  await deleteSub.mutateAsync(deleteSubTarget.id);
                  setDeleteSubTarget(null);
                  setOpen(false);
                  if (projectId === deleteSubTarget.id) {
                    router.push("/th/profile");
                  }
                }}
                disabled={deleteSub.isPending}
                style={{ flex: 1, height: 40, borderRadius: 10, border: "none", background: "#E24B4A", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: deleteSub.isPending ? 0.5 : 1 }}
              >
                {deleteSub.isPending ? "กำลังลบ…" : "ลบ"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trigger button */}
      <button
        onClick={() => { setOpen((v) => !v); setShowAddForm(false); }}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "none", border: "none", cursor: "pointer", padding: "2px 0",
        }}
      >
        <div>
          {!isShell && (
            <div style={{ fontSize: 10, color: "#888780", letterSpacing: "0.06em", textAlign: "left" }}>
              {parentName}
            </div>
          )}
          <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A18", display: "flex", alignItems: "center", gap: 4 }}>
            {currentLabel}
            <svg
              width="10" height="6" viewBox="0 0 10 6" fill="none"
              style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }}
            >
              <path d="M1 1l4 4 4-4" stroke="#888780" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </button>

      {/* Dropdown */}
      {open && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 48 }}
            onClick={() => {
              if (deleteSubTarget) return;
              setOpen(false);
              setShowAddForm(false);
            }}
          />

          <div style={{
            position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 49,
            background: "#fff", border: "0.5px solid #E8E6E0", borderRadius: 14,
            boxShadow: "0 8px 32px rgba(0,0,0,0.12)", minWidth: 220, maxWidth: 280,
            overflow: "hidden",
          }}>
            <div style={{
              padding: "10px 14px 6px", fontSize: 10, fontWeight: 700,
              letterSpacing: "0.1em", textTransform: "uppercase",
              color: "#B0A090", borderBottom: "0.5px solid #F5F4F0",
            }}>
              {parentName} · โครงการย่อย
            </div>

            {subprojects.length === 0 && (
              <div style={{ padding: "12px 14px", fontSize: 12, color: "#B0A090" }}>
                ยังไม่มีโครงการย่อย
              </div>
            )}

            {subprojects.map((sub) => {
              const isCurrent = sub.id === projectId;
              return (
                <div
                  key={sub.id}
                  style={{
                    display: "flex", alignItems: "center",
                    borderBottom: "0.5px solid #F5F4F0",
                    background: isCurrent ? "#F5EDD8" : "transparent",
                  }}
                >
                  <button
                    onClick={() => {
                      setOpen(false);
                      if (!isCurrent) router.push(`/th/workspace/${sub.id}/${sub.id}`);
                    }}
                    style={{
                      flex: 1, display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 14px", background: "transparent", border: "none",
                      cursor: isCurrent ? "default" : "pointer",
                      textAlign: "left", fontFamily: "inherit",
                    }}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: 8,
                      background: isCurrent ? "#C49A3C" : "#F5F4F0",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 700,
                      color: isCurrent ? "#fff" : "#888780", flexShrink: 0,
                    }}>
                      {sub.name[0]?.toUpperCase() ?? "S"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, fontWeight: isCurrent ? 600 : 400,
                        color: isCurrent ? "#8B6520" : "#1A1A18",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {sub.name}
                      </div>
                    </div>
                    {isCurrent && <span style={{ fontSize: 11, color: "#C49A3C", flexShrink: 0 }}>✓</span>}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteSubTarget({ id: sub.id, name: sub.name }); }}
                    title="ลบโครงการย่อย"
                    style={{
                      width: 32, height: 32, flexShrink: 0, marginRight: 6,
                      background: "none", border: "none", cursor: "pointer",
                      color: "#CCC4B8", fontSize: 14, borderRadius: 6,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    🗑
                  </button>
                </div>
              );
            })}

            {!showAddForm ? (
              <button
                onClick={() => setShowAddForm(true)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8,
                  padding: "10px 14px", background: "transparent", border: "none",
                  cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                  color: "#8B6520", fontSize: 13, fontWeight: 500,
                }}
              >
                <span style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: "#FEF3DC", border: "1px dashed #C49A3C",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16, color: "#C49A3C", flexShrink: 0,
                }}>+</span>
                เพิ่มโครงการย่อย
              </button>
            ) : (
              <form onSubmit={handleCreate} style={{ padding: "10px 14px 12px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#C49A3C", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
                  ชื่อโครงการย่อย *
                </div>
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="เช่น ห้องนอน, ห้องน้ำ"
                  style={{
                    width: "100%", height: 36, border: "0.5px solid #E8E6E0", borderRadius: 8,
                    padding: "0 10px", fontSize: 12, fontFamily: "inherit", outline: "none",
                    background: "#fff", color: "#1A1A18", boxSizing: "border-box", marginBottom: 6,
                  }}
                />
                <input
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="รายละเอียด (optional)"
                  style={{
                    width: "100%", height: 36, border: "0.5px solid #E8E6E0", borderRadius: 8,
                    padding: "0 10px", fontSize: 12, fontFamily: "inherit", outline: "none",
                    background: "#fff", color: "#1A1A18", boxSizing: "border-box", marginBottom: 8,
                  }}
                />
                {formError && <div style={{ fontSize: 11, color: "#E24B4A", marginBottom: 6 }}>{formError}</div>}
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => { setShowAddForm(false); setNewName(""); setNewDesc(""); setFormError(""); }}
                    style={{ flex: 1, height: 32, background: "#F5F4F0", border: "none", borderRadius: 8, fontSize: 11, color: "#888", cursor: "pointer", fontFamily: "inherit" }}
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={creating || !newName.trim()}
                    style={{
                      flex: 2, height: 32,
                      background: creating || !newName.trim() ? "#E8E6E0" : "#1A1A18",
                      border: "none", borderRadius: 8, fontSize: 11,
                      fontWeight: 600, color: creating || !newName.trim() ? "#aaa" : "#fff",
                      cursor: creating || !newName.trim() ? "not-allowed" : "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {creating ? "กำลังสร้าง…" : "สร้าง"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </>
      )}
    </div>
  );
}
// ── Shell view (main project with no canvas) ──────────────────────────────────

function ShellView({ projectId }: { projectId: string }) {
  return (
    <div className="hm-app">
      <div className="hm-hero-bar">
        <div>
          <div className="hm-wordmark">House<span>Mind</span></div>
          <div className="hm-hero-sub">Visual decisions workspace</div>
        </div>
        <a href="/th/profile" style={{ textDecoration: "none" }}>
          <button className="hm-role-badge">← โครงการ</button>
        </a>
      </div>

      <div className="hm-proj-nav">
        <SubprojectNav projectId={projectId} isShell={true} />
      </div>

      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "60px 24px",
        textAlign: "center",
        color: "#B0A090",
      }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🏗️</div>
        <div style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: 18,
          color: "#1A1A18",
          marginBottom: 8,
        }}>
          เลือกโครงการย่อย
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
          กดชื่อโครงการด้านบนเพื่อเลือกหรือเพิ่มโครงการย่อย
        </div>
      </div>
    </div>
  );
}

interface FilmThumbProps {
  slide: { imageId: string; url: string; label: string };
  index: number;
  isActive: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onLongPress: () => void;
}

function FilmThumb({ slide, index, isActive, canDelete, onSelect, onLongPress }: FilmThumbProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return (
    <div
      className={`hm-film-thumb ${isActive ? "active" : ""}`}
      onClick={onSelect}
      onPointerDown={() => {
        if (!canDelete) return;
        timerRef.current = setTimeout(onLongPress, 600);
      }}
      onPointerUp={() => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } }}
      onPointerLeave={() => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } }}
    >
      {slide.url && <img src={slide.url} alt={slide.label} />}
      <span style={{ position: "relative", zIndex: 1 }}>{index + 1}</span>
    </div>
  );
}

// ── Main WorkspaceShell ───────────────────────────────────────────────────────

export function WorkspaceShell({ imageId, imageUrl, projectId, forceReadOnly }: Props) {
  const auth = useAuth();
  const qc = useQueryClient();
  const readOnly = forceReadOnly || auth.isReadOnly;

  // Detect if this projectId is a main project (shell) or a subproject
  const { data: currentProject } = useProjectDetail(projectId);
  const isShell = currentProject
    ? currentProject.parent_project_id === null
    : false;

  // ── Slides ────────────────────────────────────────────────────────────────
  const { data: dbImages, refetch: refetchImages } = useProjectImages(projectId);
  const { slides, currentSlide, activeSlide, setCurrentSlide, resetSeed, addLocalSlide, prev, next } =
    useSlides({ initialImageId: imageId, initialImageUrl: imageUrl, dbImages });

  const handleUploadSuccess = useCallback(async () => {
    await refetchImages();
    resetSeed();
    
  }, [resetSeed, refetchImages]);

  const deleteImageMutation = useDeleteProjectImage(projectId);
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
  const [deleteImageTarget, setDeleteImageTarget] = useState<{ id: string; label: string; annotationCount: number } | null>(null);
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

  // ── Shell mode: no canvas ─────────────────────────────────────────────────
  if (isShell) {
    return <ShellView projectId={projectId} />;
  }

  // ── Full workspace ────────────────────────────────────────────────────────
  return (
    <>
      {fanVisible && (
        <FanEmojiMenu pos={fanPos} onPick={handleEmojiPick} onClose={() => setFanVisible(false)} />
      )}

      {deleteImageTarget && (
        <div className="hm-del-overlay">
          <div className="hm-imgdel-card" style={{
            background: "#fff", borderRadius: 16, padding: "24px 24px 20px",
            width: 300, boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
          }}>
            <div className="hm-del-icon">🖼️</div>
            <div className="hm-del-title">ลบรูปภาพนี้?</div>
            <div className="hm-del-meta">{deleteImageTarget.label}</div>
            {deleteImageTarget.annotationCount > 0 && (
              <div className="hm-imgdel-warn">
                ⚠ จะลบ {deleteImageTarget.annotationCount} annotation ด้วย
              </div>
            )}
            <div className="hm-del-actions">
              <button className="hm-del-cancel" onClick={() => setDeleteImageTarget(null)}>
                ยกเลิก
              </button>
              <button
                className="hm-del-confirm"
                onClick={async () => {
                  await deleteImageMutation.mutateAsync(deleteImageTarget.id);
                  setDeleteImageTarget(null);
                  if (activeSlide.imageId === deleteImageTarget.id) handleSlideChange(0);
                  await refetchImages();
                  resetSeed();
                }}
                disabled={deleteImageMutation.isPending}
                style={{ opacity: deleteImageMutation.isPending ? 0.5 : 1 }}
              >
                {deleteImageMutation.isPending ? "กำลังลบ…" : "ลบ"}
              </button>
            </div>
          </div>
        </div>
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
            <div className="hm-wordmark">House<span>Mind</span></div>
            <div className="hm-hero-sub">Visual decisions workspace</div>
          </div>
          <a href="/th/profile" style={{ textDecoration: "none" }}>
            <button className="hm-role-badge">{auth.role ?? "Sign in"}</button>
          </a>
        </div>

        {/* Nav with subproject dropdown */}
        <div className="hm-proj-nav">
          <SubprojectNav projectId={projectId} isShell={false} />
        </div>

        {/* Canvas */}
        <div className="hm-canvas-wrap">
          {activeSlide.url && (
        <img
          className="hm-canvas-img"
          src={activeSlide.url}
          alt={activeSlide.label}
          onError={() => {
            if (projectId !== "demo") {
              refetchImages();
            }
          }}
        />          
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
                  slide={s}
                  index={i}
                  isActive={i === currentSlide}
                  canDelete={auth.canWrite && !s.imageId.startsWith("local-")}
                  onSelect={() => handleSlideChange(i)}
                  onLongPress={() => {
                    const annCount = (useAnnotationStore.getState().annotationsByImage[s.imageId] ?? []).length;
                    setDeleteImageTarget({ id: s.imageId, label: s.label, annotationCount: annCount });
                  }}
                />
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