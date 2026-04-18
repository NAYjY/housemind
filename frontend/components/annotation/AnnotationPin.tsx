"use client";

/**
 * components/annotation/AnnotationPin.tsx — HouseMind
 * Luxury burnished-bronze pin style.
 */

import { Annotation } from "@/store/annotationStore";
import { useAnnotationStore } from "@/store/annotationStore";
import Image from "next/image";

interface AnnotationPinProps {
  annotation: Annotation;
  isActive: boolean;
  index: number;
}

const T = {
  accent:      "#8B6520",
  accentMid:   "#C49A3C",
  accentLight: "#F5EDD8",
  accentDark:  "#5C420E",
} as const;

export function AnnotationPin({ annotation, isActive, index }: AnnotationPinProps) {
  const setActivePin = useAnnotationStore((s) => s.setActivePin);

  const left = `${annotation.position_x * 100}%`;
  const top  = `${annotation.position_y * 100}%`;

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
        pointerEvents: "none",
        opacity: annotation.resolved_at ? 0.45 : 1,
        transition: "opacity 0.2s",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        {/* Pin bubble */}
        <div
          style={{
            width: isActive ? 50 : 42,
            height: isActive ? 50 : 42,
            borderRadius: "50% 50% 50% 0",
            transform: "rotate(-45deg)",
            background: isActive ? T.accent : "rgba(255,255,255,0.96)",
            boxShadow: isActive
              ? `0 4px 20px rgba(139,101,32,0.45)`
              : "0 2px 10px rgba(0,0,0,0.2)",
            border: `2.5px solid ${isActive ? T.accentMid : T.accent}`,
            transition: "all 0.18s ease",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              transform: "rotate(45deg)",
              borderRadius: "50%",
              overflow: "hidden",
              width: "80%",
              height: "80%",
            }}
          >
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
                  background: isActive ? T.accentMid : T.accentLight,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: isActive ? "#fff" : T.accentDark,
                  fontSize: 13,
                  fontWeight: 500,
                  fontFamily: "'DM Serif Display', serif",
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
            height: 9,
            background: isActive ? T.accent : "rgba(255,255,255,0.85)",
            marginTop: -1,
            boxShadow: "0 2px 4px rgba(0,0,0,0.18)",
          }}
        />
      </div>
    </div>
  );
}
