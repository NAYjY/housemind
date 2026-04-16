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

export function AnnotationCanvas({
  imageId,
  imageUrl,
  projectId: _projectId, // reserved for future project-scoped operations
  readOnly = false,
}: AnnotationCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activePinId = useAnnotationStore((s) => s.activePinId);
  const annotations = useAnnotationStore(
    (s) => s.annotationsByImage[imageId] ?? []
  );

  useAnnotations(imageId); // fetch + hydrate store

  const createMutation = useCreateAnnotation(imageId);
  const deleteMutation = useDeleteAnnotation(imageId);

  const handleCreateAnnotation = (posX: number, posY: number) => {
    if (readOnly) return;
    // TODO [FLAG-1]: Open product-picker modal here before POSTing.
    // Until product picker is built, annotation is created without a linked product.
    // linked_product_id is nullable — product can be assigned later.
    createMutation.mutate({
      positionX: posX,
      positionY: posY,
      linkedProductId: null,
    });
  };

  const handleDeleteAnnotation = (annotationId: string) => {
    if (readOnly) return;
    deleteMutation.mutate(annotationId);
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
