// components/workspace/WorkspaceShell.tsx
"use client";

import { useState, useCallback } from "react";
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
import { useProjectImages } from "@/hooks/useProjectImages";
import { useLinkProduct, type ProductDetail } from "@/hooks/useProducts";
import { useProjectDetail, useCreateSubProject } from "@/hooks/useProjects";
import { ProductDetailPanel } from "@/components/annotation/ProductDetailPanel";
import { ProductPickerModal } from "@/components/annotation/ProductPickerModal";
import { FanEmojiMenu } from "./FanEmojiMenu";
import { DeleteConfirmPopup } from "./DeleteConfirmPopup";
import { ProductGrid } from "./ProductGrid";
import { WorkspaceCanvas } from "./WorkspaceCanvas";
import { useSlides } from "@/hooks/useSlides";
import { useImageUpload } from "@/hooks/useImageUpload";
import { authFetch } from "@/lib/auth";

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
  isShell: boolean;
}

function SubprojectNav({ projectId, isShell }: SubprojectNavProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

  const { data: currentProject } = useProjectDetail(projectId);
  const parentId = isShell
    ? projectId
    : (currentProject?.parent_project_id ?? null);

  const { data: parentDetail, refetch: refetchParent } = useProjectDetail(
    parentId ?? ""
  );

  const createSub = useCreateSubProject(parentId ?? "");
  const subprojects = parentDetail?.subprojects ?? [];
  const parentName = parentDetail?.name ?? "";
  const currentLabel = isShell
    ? (parentDetail?.name ?? "…")
    : (currentProject?.name ?? "…");

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
      <button
        onClick={() => { setOpen((v) => !v); setShowAddForm(false); }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "2px 0",
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

      {open && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 48 }}
            onClick={() => { setOpen(false); setShowAddForm(false); }}
          />
          <div style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            zIndex: 49,
            background: "#fff",
            border: "0.5px solid #E8E6E0",
            borderRadius: 14,
            boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
            minWidth: 220,
            maxWidth: 280,
            overflow: "hidden",
          }}>
            <div style={{
              padding: "10px 14px 6px",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#B0A090",
              borderBottom: "0.5px solid #F5F4F0",
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
                <button
                  key={sub.id}
                  onClick={() => {
                    setOpen(false);
                    if (!isCurrent) router.push(`/th/workspace/${sub.id}/${sub.id}`);
                  }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 14px",
                    background: isCurrent ? "#F5EDD8" : "transparent",
                    border: "none",
                    borderBottom: "0.5px solid #F5F4F0",
                    cursor: isCurrent ? "default" : "pointer",
                    textAlign: "left",
                    fontFamily: "inherit",
                  }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: 8,
                    background: isCurrent ? "#C49A3C" : "#F5F4F0",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 700,
                    color: isCurrent ? "#fff" : "#888780",
                    flexShrink: 0,
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
                  {isCurrent && (
                    <span style={{ fontSize: 11, color: "#C49A3C", flexShrink: 0 }}>✓</span>
                  )}
                </button>
              );
            })}

            {!showAddForm ? (
              <button
                onClick={() => setShowAddForm(true)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 14px",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "inherit",
                  color: "#8B6520",
                  fontSize: 13,
                  fontWeight: 500,
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
                    width: "100%", height: 36,
                    border: "0.5px solid #E8E6E0", borderRadius: 8,
                    padding: "0 10px", fontSize: 12,
                    fontFamily: "inherit", outline: "none",
                    background: "#fff", color: "#1A1A18",
                    boxSizing: "border-box", marginBottom: 6,
                  }}
                />
                <input
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="รายละเอียด (optional)"
                  style={{
                    width: "100%", height: 36,
                    border: "0.5px solid #E8E6E0", borderRadius: 8,
                    padding: "0 10px", fontSize: 12,
                    fontFamily: "inherit", outline: "none",
                    background: "#fff", color: "#1A1A18",
                    boxSizing: "border-box", marginBottom: 8,
                  }}
                />
                {formError && (
                  <div style={{ fontSize: 11, color: "#E24B4A", marginBottom: 6 }}>{formError}</div>
                )}
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

// ── Shell view ────────────────────────────────────────────────────────────────

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

// ── Main WorkspaceShell ───────────────────────────────────────────────────────

export function WorkspaceShell({ imageId, imageUrl, projectId, forceReadOnly }: Props) {
  const auth = useAuth();
  const readOnly = forceReadOnly || auth.isReadOnly;

  const { data: currentProject } = useProjectDetail(projectId);
  const isShell = currentProject
    ? currentProject.parent_project_id === null
    : false;

  // ── Slides ────────────────────────────────────────────────────────────────
  const { data: dbImages, refetch: refetchImages } = useProjectImages(projectId);
  const {
    slides,
    currentSlide,
    activeSlide,
    setCurrentSlide,
    resetSeed,
    addLocalSlide,
    prev,
    next,
  } = useSlides({ initialImageId: imageId, initialImageUrl: imageUrl, dbImages });

  const handleUploadSuccess = useCallback(async () => {
    await refetchImages();
    resetSeed();
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
  const annotations = useAnnotationStore(
    (s) => s.annotationsByImage[activeSlide.imageId] ?? []
  );
  const createMutation = useCreateAnnotation(activeSlide.imageId, projectId);
  const deleteMutation = useDeleteAnnotation(activeSlide.imageId);
  const linkProduct = useLinkProduct(projectId);
  const moveMutation = useMoveAnnotation(projectId);

  const activeAnnotation = activePinId
    ? annotations.find((a) => a.id === activePinId) ?? null
    : null;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleLongPress = useCallback(
    (normX: number, normY: number, clientX: number, clientY: number) => {
      setPendingPos({ normX, normY });
      setFanPos({ x: clientX, y: clientY });
      setFanVisible(true);
    },
    []
  );

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

  const handlePinTap = useCallback((id: string) => {
    setActivePinId((prev) => (prev === id ? null : id));
    setShowAll(false);
    setActiveProduct(null);
  }, []);

  const handleSlideChange = useCallback(
    (idx: number) => {
      setCurrentSlide(idx);
      setActivePinId(null);
      setActiveProduct(null);
      setFilmExpanded(false);
    },
    [setCurrentSlide]
  );

  const handleFilmToggle = useCallback(() => {
    setFilmExpanded((v) => !v);
  }, []);

  const handleUrlSubmit = useCallback(
    (url: string) => {
      submitUrl(url, (localUrl) => {
        addLocalSlide(localUrl);
        setRefInput("");
        setFilmExpanded(false);
      });
    },
    [submitUrl, addLocalSlide]
  );

  const handleSlidePrev = useCallback(() => {
    prev();
    setActivePinId(null);
    setActiveProduct(null);
  }, [prev]);

  const handleSlideNext = useCallback(() => {
    next();
    setActivePinId(null);
    setActiveProduct(null);
  }, [next]);

  // ── Shell mode ────────────────────────────────────────────────────────────
  if (isShell) {
    return <ShellView projectId={projectId} />;
  }

  // ── Full workspace ────────────────────────────────────────────────────────
  return (
    <>
      {fanVisible && (
        <FanEmojiMenu
          pos={fanPos}
          onPick={handleEmojiPick}
          onClose={() => setFanVisible(false)}
        />
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

        <div className="hm-proj-nav">
          <SubprojectNav projectId={projectId} isShell={false} />
        </div>

        <WorkspaceCanvas
          activeSlide={activeSlide}
          slides={slides}
          currentSlide={currentSlide}
          annotations={annotations}
          activePinId={activePinId}
          readOnly={readOnly}
          isAuthenticated={auth.isAuthenticated}
          canAnnotate={!readOnly}
          isCreating={createMutation.isPending}
          filmExpanded={filmExpanded}
          uploading={uploading}
          uploadError={uploadError}
          refInput={refInput}
          showMultipleSlides={slides.length > 1}
          onLongPress={handleLongPress}
          onPinTap={handlePinTap}
          onPinLongPress={(ann) => setDeleteTarget(ann)}
          onPinMove={(id, normX, normY) => moveMutation.mutate({ id, normX, normY })}
          onSlideChange={handleSlideChange}
          onSlidePrev={handleSlidePrev}
          onSlideNext={handleSlideNext}
          onFilmToggle={handleFilmToggle}
          onRefInputChange={setRefInput}
          onUrlSubmit={handleUrlSubmit}
          onFileUpload={uploadFile}
          onImageError={() => {
            if (projectId !== "demo") refetchImages();
          }}
        />

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