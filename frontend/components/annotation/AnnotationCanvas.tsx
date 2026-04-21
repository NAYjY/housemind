// components/annotation/AnnotationCanvas.tsx
"use client";

import { useRef } from "react";
import Image from "next/image";
import { useAnnotationStore } from "@/store/annotationStore";
import { useAnnotations, useCreateAnnotation, useDeleteAnnotation } from "@/hooks/useAnnotations";
import { useTouchInteractions } from "@/hooks/useTouchInteractions";
import { AnnotationPin } from "./AnnotationPin";

interface AnnotationCanvasProps {
  imageId: string;
  imageUrl: string;
  projectId: string;
  readOnly?: boolean;
}

// Default object_id used when creating via the simple canvas tap flow.
// The WorkspaceShell fan-menu picks the real object_id; this canvas
// component only exists as a lightweight fallback / demo path.
const DEFAULT_OBJECT_ID = 101;

export function AnnotationCanvas({
  imageId,
  imageUrl,
  projectId,
  readOnly = false,
}: AnnotationCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activePinId = useAnnotationStore((s) => s.activePinId);
  const annotations = useAnnotationStore(
    (s) => s.annotationsByImage[imageId] ?? []
  );

  useAnnotations(imageId); // fetch + hydrate store

  // FIX: useCreateAnnotation now requires both imageId AND projectId
  const createMutation = useCreateAnnotation(imageId, projectId);
  const deleteMutation = useDeleteAnnotation(imageId);

  const handleCreateAnnotation = (posX: number, posY: number) => {
    if (readOnly) return;
    // TODO [FLAG-1]: Open product-picker modal here before POSTing.
    // Until product picker is built, annotation is created without a linked product.
    // FIX: payload shape changed — use objectId (int), not linkedProductId (null)
    createMutation.mutate({
      positionX: posX,
      positionY: posY,
      objectId: DEFAULT_OBJECT_ID,
    });
  };

  const handleDeleteAnnotation = (annotationId: string) => {
    if (readOnly) return;
    // FIX: mutate now expects { annotationId, projectId }, not a bare string
    deleteMutation.mutate({ annotationId, projectId });
  };

  const { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel } =
    useTouchInteractions({
      imageId,
      annotations,
      containerRef,
      onCreateAnnotation: handleCreateAnnotation,
      onDeleteAnnotation: handleDeleteAnnotation,
    });

  return (
    <div
      ref={containerRef}
      data-testid="annotation-canvas"
      role="img"
      aria-label="Annotatable workspace image with pins"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        cursor: readOnly ? "default" : "crosshair",
        touchAction: "none", // prevent browser scroll hijacking on canvas
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
      onTouchStart={readOnly ? undefined : onTouchStart}
      onTouchMove={readOnly ? undefined : onTouchMove}
      onTouchEnd={readOnly ? undefined : onTouchEnd}
      onTouchCancel={readOnly ? undefined : onTouchCancel}
    >
      {/* Base image */}
      <Image
        src={imageUrl}
        alt="Annotatable workspace image"
        fill
        priority
        draggable={false}
        style={{ objectFit: "contain", pointerEvents: "none" }}
      />

      {/* Annotation pins — normalized coords, no pixel math */}
      {annotations.map((ann, i) => (
        <AnnotationPin
          key={ann.id}
          annotation={ann}
          isActive={activePinId === ann.id}
          index={i}
        />
      ))}

      {/* Loading overlay */}
      {createMutation.isPending && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div className="spinner" />
        </div>
      )}
    </div>
  );
}