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
  const parentId = isShell ? projectId : (currentProject?.parent_project_id ?? null);
  const { data: parentDetail, refetch: refetchParent } = useProjectDetail(parentId ?? "");
  const createSub = useCreateSubProject(parentId ?? "");
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
      setNewName(""); setNewDesc(""); setShowAddForm(false); setOpen(false);
      router.push(`/th/workspace/${created.id}/${created.id}`);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to create");
    } finally { setCreating(false); }
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => { setOpen((v) => !v); setShowAddForm(false); }}
        className="hm-subnav-trigger"
      >
        <div>
          {!isShell && <div className="hm-subnav-parent-label">{parentName}</div>}
          <div className="hm-subnav-current-label">
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
          <div className="hm-subnav-backdrop" onClick={() => { setOpen(false); setShowAddForm(false); }} />
          <div className="hm-subnav-dropdown">
            <div className="hm-subnav-dropdown-header">{parentName} · โครงการย่อย</div>

            {subprojects.length === 0 && (
              <div className="hm-subnav-empty">ยังไม่มีโครงการย่อย</div>
            )}

            {subprojects.map((sub) => {
              const isCurrent = sub.id === projectId;
              return (
                <button
                  key={sub.id}
                  onClick={() => { setOpen(false); if (!isCurrent) router.push(`/th/workspace/${sub.id}/${sub.id}`); }}
                  className={`hm-subnav-item ${isCurrent ? "active" : ""}`}
                >
                  <div className="hm-subnav-item-icon">
                    {sub.name[0]?.toUpperCase() ?? "S"}
                  </div>
                  <div className="hm-subnav-item-name">{sub.name}</div>
                  {isCurrent && <span style={{ fontSize: 11, color: "#C49A3C", flexShrink: 0 }}>✓</span>}
                </button>
              );
            })}

            {!showAddForm ? (
              <button onClick={() => setShowAddForm(true)} className="hm-subnav-add-btn">
                <span className="hm-subnav-add-icon">+</span>
                เพิ่มโครงการย่อย
              </button>
            ) : (
              <form onSubmit={handleCreate} className="hm-subnav-form">
                <div className="hm-subnav-form-label">ชื่อโครงการย่อย *</div>
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="เช่น ห้องนอน, ห้องน้ำ"
                  className="hm-subnav-form-input"
                />
                <input
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="รายละเอียด (optional)"
                  className="hm-subnav-form-input"
                />
                {formError && <div className="hm-subnav-form-error">{formError}</div>}
                <div className="hm-subnav-form-actions">
                  <button
                    type="button"
                    onClick={() => { setShowAddForm(false); setNewName(""); setNewDesc(""); setFormError(""); }}
                    className="hm-subnav-form-cancel"
                  >ยกเลิก</button>
                  <button
                    type="submit"
                    disabled={creating || !newName.trim()}
                    className="hm-subnav-form-submit"
                  >{creating ? "กำลังสร้าง…" : "สร้าง"}</button>
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

      <div className="hm-shell-empty">
        <div className="hm-shell-empty-icon">🏗️</div>
        <div className="hm-shell-empty-title">เลือกโครงการย่อย</div>
        <div className="hm-shell-empty-desc">
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