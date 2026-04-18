"use client";

/**
 * components/annotation/ProductDetailPanel.tsx — HouseMind
 * Luxury burnished-bronze theme.
 */

import Image from "next/image";
import { type Annotation } from "@/store/annotationStore";
import { useProductDetail, useResolveAnnotation, useReopenAnnotation } from "@/hooks/useAnnotations";

interface Props {
  annotation: Annotation;
  onClose: () => void;
  canResolve: boolean;
  imageId: string;
}

const T = {
  hero:        "#1C1810",
  accentMid:   "#C49A3C",
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

export function ProductDetailPanel({ annotation, onClose, canResolve, imageId }: Props) {
  const { data: product, isLoading, isError } = useProductDetail(annotation.linked_product_id);
  const resolveMutation = useResolveAnnotation(imageId);
  const reopenMutation  = useReopenAnnotation(imageId);
  const isResolved = !!annotation.resolved_at;
  const isBusy     = resolveMutation.isPending || reopenMutation.isPending;

  return (
    <div
      data-testid="product-detail-panel"
      role="region"
      aria-label="Annotation detail"
      style={{ display: "flex", flexDirection: "column", height: "100%" }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 20px 12px",
          borderBottom: `0.5px solid ${T.border}`,
          flexShrink: 0,
          background: T.bg,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 500,
            color: isResolved ? T.successText : T.textHint,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          {isResolved ? "✓ แก้ไขแล้ว · Resolved" : "รายละเอียด · Details"}
        </div>
        <button
          data-testid="close-panel-btn"
          onClick={onClose}
          aria-label="Close panel"
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: T.bg2,
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: T.textMuted,
            fontSize: 14,
          }}
        >
          ×
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: 20, background: T.bg }}>
        {isLoading && <Skeleton />}
        {isError   && <ErrorMsg />}
        {!annotation.linked_product_id && !isLoading && <NoProduct />}
        {product && (
          <>
            {product.thumbnail_url && (
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: "4/3",
                  borderRadius: 10,
                  overflow: "hidden",
                  marginBottom: 16,
                  background: T.bg2,
                }}
              >
                <Image
                  src={product.thumbnail_url}
                  alt={product.name}
                  fill
                  style={{ objectFit: "cover" }}
                  sizes="(max-width: 768px) 100vw, 328px"
                />
              </div>
            )}

            <div
              style={{
                fontFamily: "'DM Serif Display', serif",
                fontSize: 20,
                fontWeight: 400,
                color: T.text,
                lineHeight: 1.25,
                marginBottom: 4,
              }}
            >
              {product.name}
            </div>

            {product.brand && (
              <div style={{ fontSize: 12, color: T.textHint, marginBottom: 14 }}>
                {product.brand}
                {product.model ? ` · ${product.model}` : ""}
              </div>
            )}

            {product.price != null && (
              <div
                style={{
                  marginBottom: 16,
                  padding: "10px 16px",
                  background: T.accentLight,
                  borderRadius: 10,
                  display: "inline-block",
                }}
              >
                <span
                  style={{
                    fontFamily: "'DM Serif Display', serif",
                    fontSize: 20,
                    fontWeight: 400,
                    color: T.accentText,
                  }}
                >
                  ฿{product.price.toLocaleString("th-TH")}
                </span>
              </div>
            )}

            {product.description && (
              <div style={{ marginBottom: 16 }}>
                <Label>รายละเอียด</Label>
                <div style={{ fontSize: 13, color: T.text, lineHeight: 1.6 }}>
                  {product.description}
                </div>
              </div>
            )}

            {product.specs && Object.keys(product.specs).length > 0 && (
              <div>
                <Label>ข้อมูลจำเพาะ</Label>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <tbody>
                    {Object.entries(product.specs).map(([k, v]) => (
                      <tr key={k} style={{ borderBottom: `0.5px solid ${T.border}` }}>
                        <td style={{ padding: "7px 12px 7px 0", color: T.textMuted, width: "42%" }}>{k}</td>
                        <td style={{ padding: "7px 0", color: T.text }}>{String(v)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* Resolve footer */}
      {canResolve && (
        <div
          style={{
            padding: "12px 20px",
            borderTop: `0.5px solid ${T.border}`,
            flexShrink: 0,
            background: T.bg,
          }}
        >
          {isResolved ? (
            <button
              data-testid="reopen-btn"
              onClick={() => reopenMutation.mutate(annotation.id)}
              disabled={isBusy}
              style={{
                width: "100%",
                padding: "11px 0",
                borderRadius: 10,
                border: `0.5px solid ${T.border}`,
                background: "transparent",
                color: T.textMuted,
                fontSize: 13,
                fontWeight: 500,
                cursor: isBusy ? "wait" : "pointer",
                opacity: isBusy ? 0.5 : 1,
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              {isBusy ? "กำลังดำเนินการ…" : "↩ เปิดใหม่ · Reopen"}
            </button>
          ) : (
            <button
              data-testid="resolve-btn"
              onClick={() => resolveMutation.mutate(annotation.id)}
              disabled={isBusy}
              style={{
                width: "100%",
                padding: "11px 0",
                borderRadius: 10,
                border: "none",
                background: T.successBg,
                color: T.successText,
                fontSize: 13,
                fontWeight: 500,
                cursor: isBusy ? "wait" : "pointer",
                opacity: isBusy ? 0.5 : 1,
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              {isBusy ? "กำลังดำเนินการ…" : "✓ ทำเครื่องหมายว่าแก้ไขแล้ว · Resolve"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 500,
        color: "#B0A898",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function Skeleton() {
  return (
    <div style={{ animation: "hm-pulse 1.4s ease-in-out infinite" }}>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            height: i === 0 ? "auto" : 18,
            aspectRatio: i === 0 ? "4/3" : undefined,
            width: i === 0 ? "100%" : `${[100, 60, 40, 30][i]}%`,
            borderRadius: i === 0 ? 10 : 6,
            background: "#E0DAD0",
            marginBottom: 12,
          }}
        />
      ))}
      <style>{`@keyframes hm-pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  );
}

function ErrorMsg() {
  return (
    <div style={{ color: "#A03020", fontSize: 13, textAlign: "center", padding: 24 }}>
      ไม่สามารถโหลดข้อมูลสินค้าได้
    </div>
  );
}

function NoProduct() {
  return (
    <div style={{ color: "#B0A898", fontSize: 13, textAlign: "center", padding: 28 }}>
      <div style={{ fontSize: 28, marginBottom: 10 }}>📎</div>
      ยังไม่ได้เชื่อมโยงสินค้า
      <br />
      <span style={{ fontSize: 11 }}>No product linked</span>
    </div>
  );
}
