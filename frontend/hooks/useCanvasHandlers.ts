// hooks/useCanvasHandlers.ts
import { useCallback } from "react";
import type { Annotation } from "@/store/annotationStore";
import type { useWorkspaceState } from "./useWorkspaceState";
import type { useSlides } from "./useSlides";

type WorkspaceState = ReturnType<typeof useWorkspaceState>;
type SlidesApi = Pick<ReturnType<typeof useSlides>, "setCurrentSlide" | "prev" | "next" | "addLocalSlide">;

interface Deps {
  state: WorkspaceState;
  slides: SlidesApi;
  createMutation: { mutateAsync: (args: { positionX: number; positionY: number; objectId: number }) => Promise<Annotation> };
  submitUrl: (url: string, cb: (localUrl: string) => void) => void;
  resetSeed: () => void;
  refetchImages: () => Promise<unknown>;
}

export function useCanvasHandlers({ state, slides, createMutation, submitUrl, resetSeed, refetchImages }: Deps) {
  const handleUploadSuccess = useCallback(async () => {
    await refetchImages();
    resetSeed();
  }, [resetSeed, refetchImages]);

  const handleLongPress = useCallback(
    (normX: number, normY: number, clientX: number, clientY: number) => {
      state.setPendingPos({ normX, normY });
      state.setFanPos({ x: clientX, y: clientY });
      state.setFanVisible(true);
    },
    [state]
  );

  const handleEmojiPick = useCallback(
    async (objectId: number) => {
      state.setFanVisible(false);
      const ann = await createMutation.mutateAsync({
        positionX: state.pendingPos.normX,
        positionY: state.pendingPos.normY,
        objectId,
      });
      state.setActivePinId(ann.id);
      state.setShowAll(false);
    },
    [state, createMutation]
  );

  const handlePinTap = useCallback(
    (id: string) => {
      state.setActivePinId((prev) => (prev === id ? null : id));
      state.setShowAll(false);
      state.setActiveProduct(null);
    },
    [state]
  );

  const handleSlideChange = useCallback(
    (idx: number) => {
      slides.setCurrentSlide(idx);
      state.setActivePinId(null);
      state.setActiveProduct(null);
      state.setFilmExpanded(false);
    },
    [slides, state]
  );

  const handleFilmToggle = useCallback(() => {
    state.setFilmExpanded((v) => !v);
  }, [state]);

  const handleUrlSubmit = useCallback(
    (url: string) => {
      submitUrl(url, (localUrl) => {
        slides.addLocalSlide(localUrl);
        state.setRefInput("");
        state.setFilmExpanded(false);
      });
    },
    [submitUrl, slides, state]
  );

  const handleSlidePrev = useCallback(() => {
    slides.prev();
    state.setActivePinId(null);
    state.setActiveProduct(null);
  }, [slides, state]);

  const handleSlideNext = useCallback(() => {
    slides.next();
    state.setActivePinId(null);
    state.setActiveProduct(null);
  }, [slides, state]);

  return {
    handleUploadSuccess,
    handleLongPress,
    handleEmojiPick,
    handlePinTap,
    handleSlideChange,
    handleFilmToggle,
    handleUrlSubmit,
    handleSlidePrev,
    handleSlideNext,
  };
}