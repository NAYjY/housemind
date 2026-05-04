// components/workspace/WorkspaceShell.tsx
"use client";

import { useAnnotations, useCreateAnnotation, useDeleteAnnotation, useMoveAnnotation } from "@/hooks/useAnnotations";
import { useAnnotationStore } from "@/store/annotationStore";
import { useAuth } from "@/hooks/useAuth";
import { useProjectImages } from "@/hooks/useProjectImages";
import { useLinkProduct } from "@/hooks/useProducts";
import { useProjectDetail } from "@/hooks/useProjects";
import { useSlides } from "@/hooks/useSlides";
import { useImageUpload } from "@/hooks/useImageUpload";
import { useWorkspaceState } from "@/hooks/useWorkspaceState";
import { useCanvasHandlers } from "@/hooks/useCanvasHandlers";
import { ProductDetailPanel } from "@/components/annotation/ProductDetailPanel";
import { ProductPickerModal } from "@/components/annotation/ProductPickerModal";
import { FanEmojiMenu } from "./FanEmojiMenu";
import { DeleteConfirmPopup } from "./DeleteConfirmPopup";
import { ProductGrid } from "./ProductGrid";
import { WorkspaceCanvas } from "./WorkspaceCanvas";
import { ShellView } from "./ShellView";
import { SubprojectNav } from "./SubprojectNav";
import styles from "./WorkspaceShell.module.css";

interface Props {
  imageId: string;
  imageUrl: string;
  projectId: string;
  forceReadOnly?: boolean;
}

export function WorkspaceShell({ imageId, imageUrl, projectId, forceReadOnly }: Props) {
  const auth = useAuth();
  const readOnly = forceReadOnly || auth.isReadOnly;

  const { data: currentProject } = useProjectDetail(projectId);
  const isShell = currentProject?.parent_project_id === null;

  const { data: dbImages, refetch: refetchImages } = useProjectImages(projectId);
  const { slides, currentSlide, activeSlide, setCurrentSlide, resetSeed, addLocalSlide, prev, next } =
    useSlides({ initialImageId: imageId, initialImageUrl: imageUrl, dbImages });

  const state = useWorkspaceState();

  const createMutation = useCreateAnnotation(activeSlide.imageId, projectId);
  const deleteMutation = useDeleteAnnotation(activeSlide.imageId);
  const moveMutation = useMoveAnnotation(projectId);
  const linkProduct = useLinkProduct(projectId);

  useAnnotations(activeSlide.imageId);
  const annotations = useAnnotationStore((s) => s.annotationsByImage[activeSlide.imageId] ?? []);
  const activeAnnotation = state.activePinId
    ? annotations.find((a) => a.id === state.activePinId) ?? null
    : null;

  const { uploading, uploadError, uploadFile, submitUrl } = useImageUpload({
    projectId,
    isAuthenticated: auth.isAuthenticated,
    onSuccess: async () => { await refetchImages(); resetSeed(); },
  });

  const handlers = useCanvasHandlers({
    state,
    slides: { setCurrentSlide, prev, next, addLocalSlide },
    createMutation,
    submitUrl,
    resetSeed,
    refetchImages,
  });

  if (isShell) return <ShellView projectId={projectId} />;

  return (
    <>
      {state.fanVisible && (
        <FanEmojiMenu
          pos={state.fanPos}
          onPick={handlers.handleEmojiPick}
          onClose={() => state.setFanVisible(false)}
        />
      )}

      {state.deleteTarget && (
        <DeleteConfirmPopup
          annotation={state.deleteTarget}
          onCancel={() => state.setDeleteTarget(null)}
          onConfirm={() => {
            deleteMutation.mutate({ annotationId: state.deleteTarget!.id, projectId });
            state.setDeleteTarget(null);
            if (state.activePinId === state.deleteTarget!.id) state.setActivePinId(null);
          }}
        />
      )}

      {state.pickerOpen && (
        <ProductPickerModal
          projectId={projectId}
          onSelect={async (productId) => {
            await linkProduct.mutateAsync({ productId, objectId: activeAnnotation?.object_id ?? 0 });
            state.setPickerOpen(false);
          }}
          onClose={() => state.setPickerOpen(false)}
        />
      )}

      {state.activeProduct && (
        <ProductDetailPanel
          product={state.activeProduct}
          annotation={activeAnnotation}
          canResolve={auth.canResolve}
          imageId={activeSlide.imageId}
          onClose={() => state.setActiveProduct(null)}
        />
      )}

      <div className="hm-app">
        {!auth.isAuthenticated && (
          <div className={styles.noAuthBanner}>
            Not signed in — annotations won&apos;t save. <a href="/login">Sign in →</a>
          </div>
        )}

        <div className={styles.heroBar}>
          <div>
            <div className={styles.wordmark}>House<span>Mind</span></div>
            <div className={styles.heroSub}>Visual decisions workspace</div>
          </div>
          <a href="/en/profile" style={{ textDecoration: "none" }}>
            <button className={styles.roleBadge}>{auth.role ?? "Sign in"}</button>
          </a>
        </div>

        <div className={styles.projNav}>
          <SubprojectNav projectId={projectId} isShell={false} />
        </div>

        <WorkspaceCanvas
          activeSlide={activeSlide}
          slides={slides}
          currentSlide={currentSlide}
          annotations={annotations}
          activePinId={state.activePinId}
          readOnly={readOnly}
          isAuthenticated={auth.isAuthenticated}
          canAnnotate={!readOnly}
          isCreating={createMutation.isPending}
          filmExpanded={state.filmExpanded}
          uploading={uploading}
          uploadError={uploadError}
          refInput={state.refInput}
          showMultipleSlides={slides.length > 1}
          onLongPress={handlers.handleLongPress}
          onPinTap={handlers.handlePinTap}
          onPinLongPress={(ann) => state.setDeleteTarget(ann)}
          onPinMove={(id, normX, normY) => moveMutation.mutate({ id, normX, normY })}
          onSlideChange={handlers.handleSlideChange}
          onSlidePrev={handlers.handleSlidePrev}
          onSlideNext={handlers.handleSlideNext}
          onFilmToggle={handlers.handleFilmToggle}
          onRefInputChange={state.setRefInput}
          onUrlSubmit={handlers.handleUrlSubmit}
          onFileUpload={uploadFile}
          onImageError={() => { if (projectId !== "demo") refetchImages(); }}
        />

        <ProductGrid
          projectId={projectId}
          activeAnnotation={activeAnnotation}
          showAll={state.showAll}
          canAttach={!readOnly && auth.canWrite}
          onShowAllToggle={() => state.setShowAll((v) => !v)}
          onAttachProduct={() => state.setPickerOpen(true)}
          onProductClick={(p) => state.setActiveProduct(p)}
        />
      </div>
    </>
  );
}