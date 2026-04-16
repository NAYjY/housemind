"use client";

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
    <div data-testid="product-detail-panel" role="region" aria-label="Annotation detail" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 12px", borderBottom: "0.5px solid var(--color-border)", flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: isResolved ? "var(--color-success)" : "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {isResolved ? "✓ แก้ไขแล้ว · Resolved" : "รายละเอียด · Details"}
          </div>
        </div>
        <button data-testid="close-panel-btn" onClick={onClose} aria-label="Close panel"
          style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--color-surface-muted)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 1l12 12M13 1L1 13" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round" />
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
            {product.thumbnail_url && (
              <div style={{ position: "relative", width: "100%", aspectRatio: "4/3", borderRadius: 10, overflow: "hidden", marginBottom: 16, background: "var(--color-surface-muted)" }}>
                <Image src={product.thumbnail_url} alt={product.name} fill style={{ objectFit: "cover" }} sizes="(max-width: 768px) 100vw, 328px" />
              </div>
            )}
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", lineHeight: 1.3, marginBottom: 4 }}>{product.name}</div>
            {product.brand && <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 12 }}>{product.brand}{product.model ? ` · ${product.model}` : ""}</div>}
            {product.price != null && (
              <div style={{ marginBottom: 16, padding: "10px 14px", background: "var(--color-accent-light)", borderRadius: 8, display: "inline-block" }}>
                <span style={{ fontSize: 20, fontWeight: 700, color: "var(--color-accent)" }}>฿{product.price.toLocaleString("th-TH")}</span>
              </div>
            )}
            {product.description && (
              <div style={{ marginBottom: 16 }}>
                <Label>รายละเอียด</Label>
                <div style={{ fontSize: 13, color: "var(--color-text-primary)", lineHeight: 1.6 }}>{product.description}</div>
              </div>
            )}
            {product.specs && Object.keys(product.specs).length > 0 && (
              <div>
                <Label>ข้อมูลจำเพาะ</Label>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <tbody>
                    {Object.entries(product.specs).map(([k, v]) => (
                      <tr key={k} style={{ borderBottom: "0.5px solid var(--color-border)" }}>
                        <td style={{ padding: "6px 12px 6px 0", color: "var(--color-text-muted)", width: "40%" }}>{k}</td>
                        <td style={{ padding: "6px 0", color: "var(--color-text-primary)" }}>{String(v)}</td>
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
        <div style={{ padding: "12px 16px", borderTop: "0.5px solid var(--color-border)", flexShrink: 0 }}>
          {isResolved ? (
            <button data-testid="reopen-btn" onClick={() => reopenMutation.mutate(annotation.id)} disabled={isBusy}
              style={{ width: "100%", padding: "11px 0", borderRadius: 10, border: "1.5px solid var(--color-border)", background: "transparent", color: "var(--color-text-muted)", fontSize: 13, fontWeight: 600, cursor: isBusy ? "wait" : "pointer", opacity: isBusy ? 0.5 : 1 }}>
              {isBusy ? "กำลังดำเนินการ…" : "↩ เปิดใหม่ · Reopen"}
            </button>
          ) : (
            <button data-testid="resolve-btn" onClick={() => resolveMutation.mutate(annotation.id)} disabled={isBusy}
              style={{ width: "100%", padding: "11px 0", borderRadius: 10, border: "none", background: "var(--color-success)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: isBusy ? "wait" : "pointer", opacity: isBusy ? 0.5 : 1 }}>
              {isBusy ? "กำลังดำเนินการ…" : "✓ ทำเครื่องหมายว่าแก้ไขแล้ว · Resolve"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{children}</div>;
}
function Skeleton() {
  return (
    <div style={{ animation: "hm-pulse 1.4s ease-in-out infinite" }}>
      {[["100%","56%","100%","aspectRatio:4/3","borderRadius:10","marginBottom:16"], ["70%","20px"], ["45%","14px"], ["35%","36px"]].map((_, i) => (
        <div key={i} style={{ height: i === 0 ? "auto" : "20px", width: "70%", aspectRatio: i === 0 ? "4/3" : undefined, borderRadius: i === 0 ? 10 : 6, background: "var(--color-border)", marginBottom: 12 }} />
      ))}
      <style>{`@keyframes hm-pulse{0%,100%{opacity:1}50%{opacity:.45}}`}</style>
    </div>
  );
}
function ErrorMsg() {
  return <div style={{ color: "var(--color-error)", fontSize: 13, textAlign: "center", padding: 24 }}>ไม่สามารถโหลดข้อมูลสินค้าได้</div>;
}
function NoProduct() {
  return (
    <div style={{ color: "var(--color-text-muted)", fontSize: 13, textAlign: "center", padding: 24 }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>📎</div>
      ยังไม่ได้เชื่อมโยงสินค้า<br />
      <span style={{ fontSize: 11 }}>No product linked</span>
    </div>
  );
}
