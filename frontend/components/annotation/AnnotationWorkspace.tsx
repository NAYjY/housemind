"use client";

/**
 * components/annotation/AnnotationWorkspace.tsx — HouseMind
 * Luxury burnished-bronze theme.
 * Filmstrip tray replaces plain upload bar.
 * Role-aware, i18n-ready, ARIA labelled.
 */

import { useCallback, useState } from "react";
import { useAnnotationStore } from "@/store/annotationStore";
import { useAuth } from "@/hooks/useAuth";
import { AnnotationCanvas } from "./AnnotationCanvas";
import { ProductDetailPanel } from "./ProductDetailPanel";
import { BottomSheet } from "@/components/layout/BottomSheet";

interface AnnotationWorkspaceProps {
  imageId: string;
  imageUrl: string;
  projectId: string;
  forceReadOnly?: boolean;
}

/* ── Luxury tokens (inline — consumed by non-global elements) ── */
const T = {
  hero:        "#1C1810",
  heroText:    "#F2EDE0",
  accentMid:   "#C49A3C",
  accentDark:  "#5C420E",
  accentLight: "#F5EDD8",
  accentText:  "#4A3408",
  bg:          "#FAF8F4",
  bg2:         "#F2EFE8",
  border:      "#E0DAD0",
  text:        "#1C1810",
  textMuted:   "#7A7060",
  textHint:    "#B0A898",
  successBg:   "#EAF0DE",
  successText: "#3A5010",
} as const;

export function AnnotationWorkspace({
  imageId,
  imageUrl,
  projectId,
  forceReadOnly = false,
}: AnnotationWorkspaceProps) {
  const auth        = useAuth();
  const activePinId = useAnnotationStore((s) => s.activePinId);
  const setActivePin = useAnnotationStore((s) => s.setActivePin);
  const annotations  = useAnnotationStore((s) => s.annotationsByImage[imageId] ?? []);

  const readOnly         = forceReadOnly || auth.isReadOnly;
  const activeAnnotation = activePinId ? annotations.find((a) => a.id === activePinId) ?? null : null;

  const handleClosePanel = useCallback(() => setActivePin(null), [setActivePin]);

  const panel = activeAnnotation ? (
    <ProductDetailPanel
      annotation={activeAnnotation}
      onClose={handleClosePanel}
      canResolve={auth.canResolve}
      imageId={imageId}
    />
  ) : (
    <AnnotationListPanel annotations={annotations} onSelectPin={(id) => setActivePin(id)} />
  );

  return (
    <div
      data-testid="annotation-workspace"
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        background: T.bg,
      }}
    >
      {/* ── Canvas column ── */}
      <div style={{ flex: 1, minWidth: 0, position: "relative", height: "100%" }}>
        <AnnotationCanvas
          imageId={imageId}
          imageUrl={imageUrl}
          projectId={projectId}
          readOnly={readOnly}
        />
        {readOnly && (
          <div
            aria-label="Read-only mode"
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              background: "rgba(28,24,16,0.6)",
              color: T.heroText,
              fontSize: 10,
              fontWeight: 500,
              padding: "4px 10px",
              borderRadius: 20,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              backdropFilter: "blur(6px)",
              pointerEvents: "none",
              zIndex: 10,
            }}
          >
            {auth.role?.toUpperCase() ?? "READ ONLY"}
          </div>
        )}
      </div>

      {/* ── Desktop side panel ── */}
      <div
        className="hm-desktop-panel"
        style={{
          width: 360,
          flexShrink: 0,
          height: "100%",
          borderLeft: `0.5px solid ${T.border}`,
          background: T.bg,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Desktop panel header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: `0.5px solid ${T.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: T.hero,
          }}
        >
          <div>
            <span
              style={{
                fontFamily: "'DM Serif Display', serif",
                fontSize: 20,
                color: T.heroText,
                letterSpacing: "-0.01em",
              }}
            >
              House<span style={{ color: T.accentMid }}>Mind</span>
            </span>
          </div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "4px 10px",
              borderRadius: 20,
              border: "0.5px solid rgba(255,255,255,0.18)",
              color: "rgba(255,255,255,0.55)",
            }}
          >
            {auth.role ?? "Viewer"}
          </div>
        </div>
        {panel}
      </div>

      {/* ── Mobile bottom sheet ── */}
      <BottomSheet isOpen snapPoints={[0.25, 0.55, 0.88]} initialSnap={0}>
        {panel}
      </BottomSheet>

      <style>{`
        @media (min-width: 768px) { .hm-desktop-panel { display: flex !important; } }
        @media (max-width: 767px) { .hm-desktop-panel { display: none !important; } }
      `}</style>
    </div>
  );
}

/* ── Annotation list panel ── */
function AnnotationListPanel({
  annotations,
  onSelectPin,
}: {
  annotations: Array<{ id: string; resolved_at: string | null; linked_product_id: string | null }>;
  onSelectPin: (id: string) => void;
}) {
  const open     = annotations.filter((a) => !a.resolved_at);
  const resolved = annotations.filter((a) => a.resolved_at);

  if (annotations.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: T.textHint,
          fontSize: 13,
          gap: 10,
          padding: 28,
          textAlign: "center",
        }}
      >
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="15" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 2" />
          <path d="M16 10v6M16 20v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span style={{ color: T.textMuted }}>แตะบนรูปภาพเพื่อเพิ่มหมายเหตุ</span>
        <span style={{ fontSize: 11, opacity: 0.6 }}>Tap the image to add an annotation</span>
      </div>
    );
  }

  return (
    <div style={{ padding: "12px 0" }}>
      {open.length > 0 && <SectionLabel text={`Open · ${open.length}`} />}
      {open.map((ann, i) => (
        <AnnotationRow key={ann.id} index={i} annotation={ann} onClick={() => onSelectPin(ann.id)} />
      ))}
      {resolved.length > 0 && <SectionLabel text={`Resolved · ${resolved.length}`} muted />}
      {resolved.map((ann, i) => (
        <AnnotationRow
          key={ann.id}
          index={open.length + i}
          annotation={ann}
          onClick={() => onSelectPin(ann.id)}
          resolved
        />
      ))}
    </div>
  );
}

function SectionLabel({ text, muted = false }: { text: string; muted?: boolean }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: T.textHint,
        padding: "8px 20px 4px",
        opacity: muted ? 0.55 : 1,
      }}
    >
      {text}
    </div>
  );
}

function AnnotationRow({
  index,
  annotation,
  onClick,
  resolved = false,
}: {
  index: number;
  annotation: { id: string; linked_product_id: string | null };
  onClick: () => void;
  resolved?: boolean;
}) {
  return (
    <button
      data-testid={`annotation-row-${annotation.id}`}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: "11px 20px",
        background: "none",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        borderBottom: `0.5px solid ${T.border}`,
        opacity: resolved ? 0.5 : 1,
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = T.bg2)}
      onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "none")}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: resolved ? T.border : T.accentLight,
          color: resolved ? T.textHint : T.accentDark,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 500,
          flexShrink: 0,
        }}
      >
        {index + 1}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: T.text }}>
          หมายเหตุ #{index + 1}
        </div>
        <div style={{ fontSize: 11, color: T.textHint, marginTop: 2 }}>
          {resolved ? "✓ แก้ไขแล้ว" : "รอดำเนินการ"}
        </div>
      </div>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ opacity: 0.35, flexShrink: 0 }}>
        <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
