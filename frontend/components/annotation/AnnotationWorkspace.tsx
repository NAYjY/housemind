"use client";

// components/annotation/AnnotationWorkspace.tsx — HouseMind
// Senior-grade: role-aware, responsive (desktop panel + mobile sheet), ARIA.

import { useCallback } from "react";
import { useAnnotationStore } from "@/store/annotationStore";
import { useAuth } from "@/hooks/useAuth";
import { AnnotationCanvas } from "./AnnotationCanvas";
import { ProductDetailPanel } from "./ProductDetailPanel";
import { BottomSheet } from "@/components/layout/BottomSheet";

interface Props {
  imageId: string;
  imageUrl: string;
  projectId: string;
  forceReadOnly?: boolean;
}

export function AnnotationWorkspace({ imageId, imageUrl, projectId, forceReadOnly = false }: Props) {
  const auth = useAuth();
  const activePinId = useAnnotationStore((s) => s.activePinId);
  const setActivePin = useAnnotationStore((s) => s.setActivePin);
  const annotations = useAnnotationStore((s) => s.annotationsByImage[imageId] ?? []);

  const readOnly = forceReadOnly || auth.isReadOnly;
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
    <>
      <style>{`
        .hm-workspace { display: flex; width: 100%; height: 100%; position: relative; overflow: hidden; background: var(--color-surface-muted); }
        .hm-canvas-col { flex: 1; min-width: 0; position: relative; height: 100%; }
        .hm-side-panel { display: none; width: 340px; flex-shrink: 0; height: 100%; border-left: 0.5px solid var(--color-border); background: var(--color-surface); flex-direction: column; overflow: hidden; }
        .hm-bottom-sheet-wrap { display: block; }
        @media (min-width: 768px) {
          .hm-side-panel { display: flex; }
          .hm-bottom-sheet-wrap { display: none; }
        }
      `}</style>

      <div data-testid="annotation-workspace" className="hm-workspace">
        {/* Canvas */}
        <div className="hm-canvas-col">
          <AnnotationCanvas
            imageId={imageId}
            imageUrl={imageUrl}
            projectId={projectId}
            readOnly={readOnly}
          />

          {/* Role badge */}
          {readOnly && (
            <div
              aria-label="Read-only mode"
              style={{
                position: "absolute", top: 12, right: 12,
                background: "rgba(0,0,0,0.55)", color: "#fff",
                fontSize: 11, fontWeight: 600,
                padding: "4px 10px", borderRadius: 20,
                letterSpacing: "0.04em",
                backdropFilter: "blur(8px)",
                pointerEvents: "none", zIndex: 10,
              }}
            >
              {auth.role?.toUpperCase() ?? "READ ONLY"}
            </div>
          )}

          {/* Tap hint */}
          {!readOnly && annotations.length === 0 && (
            <div style={{
              position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)",
              background: "rgba(0,0,0,0.6)", color: "#fff",
              fontSize: 12, padding: "8px 16px", borderRadius: 20,
              backdropFilter: "blur(8px)", pointerEvents: "none", zIndex: 10,
              whiteSpace: "nowrap",
            }}>
              แตะบนรูปเพื่อเพิ่มหมายเหตุ · Tap to annotate
            </div>
          )}
        </div>

        {/* Desktop side panel */}
        <div className="hm-side-panel">{panel}</div>

        {/* Mobile bottom sheet */}
        <div className="hm-bottom-sheet-wrap">
          <BottomSheet isOpen snapPoints={[0.22, 0.55, 0.88]} initialSnap={0}>
            {panel}
          </BottomSheet>
        </div>
      </div>
    </>
  );
}

// ── Annotation list ───────────────────────────────────────────────────────────

function AnnotationListPanel({
  annotations,
  onSelectPin,
}: {
  annotations: Array<{ id: string; resolved_at: string | null; linked_product_id: string | null }>;
  onSelectPin: (id: string) => void;
}) {
  const open = annotations.filter((a) => !a.resolved_at);
  const resolved = annotations.filter((a) => a.resolved_at);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{
        padding: "16px 16px 12px",
        borderBottom: "0.5px solid var(--color-border)",
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-primary)" }}>
          หมายเหตุทั้งหมด
        </div>
        <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>
          {open.length} รอดำเนินการ · {resolved.length} แก้ไขแล้ว
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {annotations.length === 0 ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", height: "100%",
            color: "var(--color-text-muted)", fontSize: 13,
            gap: 10, padding: 32, textAlign: "center",
          }}>
            <div style={{ fontSize: 36 }}>📌</div>
            <div style={{ fontWeight: 500 }}>ยังไม่มีหมายเหตุ</div>
            <div style={{ fontSize: 11, opacity: 0.6 }}>Tap the image to add an annotation</div>
          </div>
        ) : (
          <>
            {open.length > 0 && (
              <>
                <SectionLabel text={`Open · ${open.length}`} />
                {open.map((ann, i) => (
                  <AnnotationRow key={ann.id} index={i} annotation={ann} onClick={() => onSelectPin(ann.id)} />
                ))}
              </>
            )}
            {resolved.length > 0 && (
              <>
                <SectionLabel text={`Resolved · ${resolved.length}`} muted />
                {resolved.map((ann, i) => (
                  <AnnotationRow key={ann.id} index={open.length + i} annotation={ann} onClick={() => onSelectPin(ann.id)} resolved />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ text, muted = false }: { text: string; muted?: boolean }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
      textTransform: "uppercase", color: "var(--color-text-muted)",
      padding: "10px 16px 4px", opacity: muted ? 0.55 : 1,
    }}>
      {text}
    </div>
  );
}

function AnnotationRow({
  index, annotation, onClick, resolved = false,
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
        display: "flex", alignItems: "center", gap: 12,
        width: "100%", padding: "11px 16px",
        background: "none", border: "none", cursor: "pointer",
        textAlign: "left", borderBottom: "0.5px solid var(--color-border)",
        opacity: resolved ? 0.5 : 1,
        transition: "background 0.12s",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--color-surface-muted)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "none"; }}
    >
      <div style={{
        width: 30, height: 30, borderRadius: "50%",
        background: resolved ? "var(--color-border)" : "var(--color-accent-light)",
        color: resolved ? "var(--color-text-muted)" : "var(--color-accent)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, fontWeight: 700, flexShrink: 0,
      }}>
        {resolved ? "✓" : index + 1}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>
          หมายเหตุ #{index + 1}
        </div>
        <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 1 }}>
          {resolved ? "แก้ไขแล้ว · Resolved" : "รอดำเนินการ · Open"}
          {annotation.linked_product_id && " · 🔗 สินค้า"}
        </div>
      </div>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity: 0.3 }}>
        <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
