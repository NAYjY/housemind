"use client";

/**
 * components/annotation/AnnotationWorkspace.tsx — HouseMind
 * Senior-grade rewrite: role-aware, i18n, auth context, data-testid, ARIA.
 */

import { useCallback } from "react";
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

export function AnnotationWorkspace({
  imageId,
  imageUrl,
  projectId,
  forceReadOnly = false,
}: AnnotationWorkspaceProps) {
  const auth = useAuth();
  const activePinId = useAnnotationStore((s) => s.activePinId);
  const setActivePin = useAnnotationStore((s) => s.setActivePin);
  const annotations = useAnnotationStore((s) => s.annotationsByImage[imageId] ?? []);

  const readOnly = forceReadOnly || auth.isReadOnly;
  const activeAnnotation = activePinId
    ? annotations.find((a) => a.id === activePinId) ?? null
    : null;

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
      style={{ display: "flex", width: "100%", height: "100%", position: "relative", overflow: "hidden", background: "var(--color-surface-muted)" }}
    >
      {/* Canvas */}
      <div style={{ flex: 1, minWidth: 0, position: "relative", height: "100%" }}>
        <AnnotationCanvas
          imageId={imageId}
          imageUrl={imageUrl}
          projectId={projectId}
          readOnly={readOnly}
        />
        {readOnly && (
          <div aria-label="Read-only mode" style={{ position: "absolute", top: 12, right: 12, background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 20, letterSpacing: "0.04em", backdropFilter: "blur(8px)", pointerEvents: "none", zIndex: 10 }}>
            {auth.role?.toUpperCase() ?? "READ ONLY"}
          </div>
        )}
      </div>

      {/* Desktop side panel */}
      <div className="hm-desktop-panel" style={{ width: 360, flexShrink: 0, height: "100%", borderLeft: "0.5px solid var(--color-border)", background: "var(--color-surface)", overflowY: "auto", display: "flex", flexDirection: "column" }}>
        {panel}
      </div>

      {/* Mobile bottom sheet */}
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

function AnnotationListPanel({ annotations, onSelectPin }: {
  annotations: Array<{ id: string; resolved_at: string | null; linked_product_id: string | null }>;
  onSelectPin: (id: string) => void;
}) {
  const open = annotations.filter((a) => !a.resolved_at);
  const resolved = annotations.filter((a) => a.resolved_at);

  if (annotations.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--color-text-muted)", fontSize: 13, gap: 8, padding: 24, textAlign: "center" }}>
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="15" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 2" /><path d="M16 10v6M16 20v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        <span>แตะบนรูปภาพเพื่อเพิ่มหมายเหตุ</span>
        <span style={{ fontSize: 11, opacity: 0.6 }}>Tap the image to add an annotation</span>
      </div>
    );
  }

  return (
    <div style={{ padding: "12px 0" }}>
      {open.length > 0 && <SectionLabel text={`Open · ${open.length}`} />}
      {open.map((ann, i) => <AnnotationRow key={ann.id} index={i} annotation={ann} onClick={() => onSelectPin(ann.id)} />)}
      {resolved.length > 0 && <SectionLabel text={`Resolved · ${resolved.length}`} muted />}
      {resolved.map((ann, i) => <AnnotationRow key={ann.id} index={open.length + i} annotation={ann} onClick={() => onSelectPin(ann.id)} resolved />)}
    </div>
  );
}

function SectionLabel({ text, muted = false }: { text: string; muted?: boolean }) {
  return <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", padding: "8px 16px 4px", opacity: muted ? 0.6 : 1 }}>{text}</div>;
}

function AnnotationRow({ index, annotation, onClick, resolved = false }: {
  index: number;
  annotation: { id: string; linked_product_id: string | null };
  onClick: () => void;
  resolved?: boolean;
}) {
  return (
    <button data-testid={`annotation-row-${annotation.id}`} onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "10px 16px", background: "none", border: "none", cursor: "pointer", textAlign: "left", borderBottom: "0.5px solid var(--color-border)", opacity: resolved ? 0.5 : 1 }}>
      <div style={{ width: 28, height: 28, borderRadius: "50%", background: resolved ? "var(--color-border)" : "var(--color-accent-light)", color: resolved ? "var(--color-text-muted)" : "var(--color-accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{index + 1}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>หมายเหตุ #{index + 1}</div>
        <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>{resolved ? "✓ แก้ไขแล้ว" : "รอดำเนินการ"}</div>
      </div>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity: 0.4 }}><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
  );
}
