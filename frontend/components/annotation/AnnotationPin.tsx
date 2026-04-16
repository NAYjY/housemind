// components/annotation/AnnotationPin.tsx
"use client";

import { Annotation } from "@/store/annotationStore";
import { useAnnotationStore } from "@/store/annotationStore";
import Image from "next/image";

interface AnnotationPinProps {
  annotation: Annotation;
  isActive: boolean;
  index: number;
}

/**
 * Renders an annotation pin at normalized (positionX, positionY) coordinates.
 * positionX/positionY are floats 0.0–1.0 — we convert to % for CSS positioning.
 * No pixel math in the rendering layer.
 */
export function AnnotationPin({ annotation, isActive, index }: AnnotationPinProps) {
  const setActivePin = useAnnotationStore((s) => s.setActivePin);

  // Convert normalized floats → CSS percentages
  const left = `${annotation.position_x * 100}%`;
  const top = `${annotation.position_y * 100}%`;

  return (
    <div
      className="annotation-pin"
      data-testid="annotation-pin"
      data-annotation-id={annotation.id}
      aria-label={`Annotation ${index + 1}${annotation.resolved_at ? " (resolved)" : ""}`}
      style={{
        position: "absolute",
        left,
        top,
        transform: "translate(-50%, -100%)",
        zIndex: isActive ? 30 : 20,
        pointerEvents: "none", // parent canvas handles all touch
        opacity: annotation.resolved_at ? 0.5 : 1,
        transition: "opacity 0.2s",
      }}
    >
      {/* Pin bubble */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div
          style={{
            width: isActive ? 52 : 44,
            height: isActive ? 52 : 44,
            borderRadius: "50% 50% 50% 0",
            transform: "rotate(-45deg)",
            background: isActive
              ? "var(--color-accent)"
              : "rgba(255,255,255,0.95)",
            boxShadow: isActive
              ? "0 4px 20px rgba(0,0,0,0.35)"
              : "0 2px 10px rgba(0,0,0,0.2)",
            border: `2.5px solid ${isActive ? "white" : "var(--color-accent)"}`,
            transition: "all 0.18s ease",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ transform: "rotate(45deg)", borderRadius: "50%", overflow: "hidden", width: "80%", height: "80%" }}>
            {annotation.thumbnail_url ? (
              <Image
                src={annotation.thumbnail_url}
                alt="Product thumbnail"
                width={40}
                height={40}
                style={{ objectFit: "cover", width: "100%", height: "100%" }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  background: "var(--color-accent)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                {index + 1}
              </div>
            )}
          </div>
        </div>

        {/* Pin tail */}
        <div
          style={{
            width: 2,
            height: 10,
            background: isActive ? "var(--color-accent)" : "rgba(255,255,255,0.9)",
            marginTop: -1,
            boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
          }}
        />
      </div>
    </div>
  );
}
