"use client";

// components/annotation/ProductDetailPanel.tsx — HouseMind

import Image from "next/image";
import { type Annotation } from "@/store/annotationStore";
import { useProductDetail, useResolveAnnotation, useReopenAnnotation } from "@/hooks/useAnnotations";

interface Props {
  annotation: Annotation;
  onClose: () => void;
  canResolve: boolean;
  imageId: string;
}

export function ProductDetailPanel({ annotation, onClose, canResolve, imageId }: Props) {
  const { data: product, isLoading, isError } = useProductDetail(annotation.linked_product_id);
  const resolveMutation = useResolveAnnotation(imageId);
  const reopenMutation = useReopenAnnotation(imageId);
  const isResolved = !!annotation.resolved_at;
  const isBusy = resolveMutation.isPending || reopenMutation.isPending;

  return (
    <div
      data-testid="product-detail-panel"
      role="region"
      aria-label="Annotation detail"
      style={{ display: "flex", flexDirection: "column", height: "100%" }}
    >
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 16px 12px",
        borderBottom: "0.5px solid var(--color-border)",
        flexShrink: 0,
      }}>
        <div>
          <div style={{
            fontSize: 10, fontWeight: 700,
            color: isResolved ? "var(--color-success)" : "var(--color-accent)",
            textTransform: "uppercase", letterSpacing: "0.07em",
            marginBottom: 2,
          }}>
            {isResolved ? "✓ แก้ไขแล้ว · Resolved" : "รายละเอียด · Details"}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
            {product?.name ?? (isLoading ? "กำลังโหลด…" : "ไม่มีสินค้า")}
          </div>
        </div>

        <button
          data-testid="close-panel-btn"
          onClick={onClose}
          aria-label="Close panel"
          style={{
            width: 32, height: 32, borderRadius: "50%",
            background: "var(--color-surface-muted)",
            border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M1 1l10 10M11 1L1 11" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {isLoading && <Skeleton />}
        {isError && <ErrorMsg />}
        {!annotation.linked_product_id && !isLoading && <NoProduct />}
        {product && (
          <>
            {/* Thumbnail */}
            {product.thumbnail_url && (
              <div style={{
                position: "relative", width: "100%", aspectRatio: "4/3",
                borderRadius: 10, overflow: "hidden", marginBottom: 16,
                background: "var(--color-surface-muted)",
              }}>
                <Image
                  src={product.thumbnail_url}
                  alt={product.name}
                  fill
                  style={{ objectFit: "cover" }}
                  sizes="(max-width: 768px) 100vw, 340px"
                />
              </div>
            )}

            {/* Name + brand */}
            <div style={{ fontSize: 17, fontWeight: 700, color: "var(--color-text-primary)", lineHeight: 1.25, marginBottom: 4 }}>
              {product.name}
            </div>
            {product.brand && (
              <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 14 }}>
                {product.brand}{product.model ? ` · ${product.model}` : ""}
              </div>
            )}

            {/* Price */}
            {product.price != null && (
              <div style={{
                marginBottom: 16, padding: "10px 14px",
                background: "var(--color-accent-light)",
                borderRadius: 8, display: "inline-block",
              }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: "var(--color-accent)" }}>
                  ฿{product.price.toLocaleString("th-TH")}
                </span>
                <span style={{ fontSize: 11, color: "var(--color-accent)", marginLeft: 4, opacity: 0.75 }}>
                  {product.currency}
                </span>
              </div>
            )}

            {/* Description */}
            {product.description && (
              <div style={{ marginBottom: 16 }}>
                <FieldLabel>รายละเอียด</FieldLabel>
                <div style={{ fontSize: 13, color: "var(--color-text-primary)", lineHeight: 1.65 }}>
                  {product.description}
                </div>
              </div>
            )}

            {/* Specs table */}
            {product.specs && Object.keys(product.specs).length > 0 && (
              <div>
                <FieldLabel>ข้อมูลจำเพาะ</FieldLabel>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <tbody>
                    {Object.entries(product.specs).map(([k, v]) => (
                      <tr key={k} style={{ borderBottom: "0.5px solid var(--color-border)" }}>
                        <td style={{ padding: "7px 12px 7px 0", color: "var(--color-text-muted)", width: "42%", verticalAlign: "top" }}>{k}</td>
                        <td style={{ padding: "7px 0", color: "var(--color-text-primary)" }}>{String(v)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* Resolve / Reopen footer */}
      {canResolve && (
        <div style={{ padding: "12px 16px", borderTop: "0.5px solid var(--color-border)", flexShrink: 0 }}>
          {isResolved ? (
            <button
              data-testid="reopen-btn"
              onClick={() => reopenMutation.mutate(annotation.id)}
              disabled={isBusy}
              style={{
                width: "100%", padding: "12px 0", borderRadius: 10,
                border: "1.5px solid var(--color-border)",
                background: "transparent", color: "var(--color-text-muted)",
                fontSize: 13, fontWeight: 600,
                cursor: isBusy ? "wait" : "pointer",
                opacity: isBusy ? 0.5 : 1,
                transition: "opacity 0.15s",
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
                width: "100%", padding: "12px 0", borderRadius: 10,
                border: "none", background: "var(--color-success)",
                color: "#fff", fontSize: 13, fontWeight: 600,
                cursor: isBusy ? "wait" : "pointer",
                opacity: isBusy ? 0.5 : 1,
                transition: "opacity 0.15s",
                boxShadow: "0 4px 12px rgba(99,153,34,0.25)",
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

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, color: "var(--color-text-muted)",
      textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 7,
    }}>
      {children}
    </div>
  );
}

function Skeleton() {
  return (
    <div style={{ animation: "hm-pulse 1.4s ease-in-out infinite" }}>
      <div style={{ width: "100%", aspectRatio: "4/3", borderRadius: 10, background: "var(--color-border)", marginBottom: 16 }} />
      <div style={{ width: "70%", height: 18, borderRadius: 6, background: "var(--color-border)", marginBottom: 8 }} />
      <div style={{ width: "45%", height: 13, borderRadius: 6, background: "var(--color-border)", marginBottom: 16 }} />
      <div style={{ width: "35%", height: 36, borderRadius: 8, background: "var(--color-border)" }} />
      <style>{`@keyframes hm-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
    </div>
  );
}

function ErrorMsg() {
  return (
    <div style={{ color: "var(--color-error)", fontSize: 13, textAlign: "center", padding: 32 }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>⚠</div>
      ไม่สามารถโหลดข้อมูลสินค้าได้
    </div>
  );
}

function NoProduct() {
  return (
    <div style={{ color: "var(--color-text-muted)", fontSize: 13, textAlign: "center", padding: 40 }}>
      <div style={{ fontSize: 32, marginBottom: 10 }}>📎</div>
      <div style={{ fontWeight: 500, marginBottom: 4 }}>ยังไม่ได้เชื่อมโยงสินค้า</div>
      <div style={{ fontSize: 11, opacity: 0.6 }}>No product linked to this annotation</div>
    </div>
  );
}
