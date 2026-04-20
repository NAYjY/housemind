"use client";

// app/[locale]/products/page.tsx — HouseMind
// Accessible to architect and supplier roles

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useMyProducts, useCreateProduct, useProductThumbnailUpload } from "@/hooks/useProducts";

export default function ProductsPage() {
  const auth = useAuth();
  const { data: products = [], isLoading } = useMyProducts();
  const createMutation = useCreateProduct();
  const uploadThumbnail = useProductThumbnailUpload();

  const [formOpen, setFormOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("THB");
  const [description, setDescription] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!auth.isAuthenticated) {
    return (
      <div style={{ padding: 40, textAlign: "center", fontFamily: "sans-serif" }}>
        <a href="/login">Sign in to manage products →</a>
      </div>
    );
  }

  if (auth.role !== "architect" && auth.role !== "supplier") {
    return (
      <div style={{ padding: 40, textAlign: "center", fontFamily: "sans-serif", color: "#888" }}>
        Products are managed by architects and suppliers.
      </div>
    );
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setThumbnailFile(file);
    setThumbnailPreview(URL.createObjectURL(file));
    setThumbnailUrl("");
  };

  const handleUrlChange = (url: string) => {
    setThumbnailUrl(url);
    setThumbnailPreview(url);
    setThumbnailFile(null);
  };

  const handleSubmit = async () => {
    if (!name.trim()) { setError("Name is required"); return; }
    setSubmitting(true); setError("");
    try {
      let finalThumbnailUrl = thumbnailUrl;

      if (thumbnailFile) {
        // S3 upload
        const s3_key = await uploadThumbnail.mutateAsync(thumbnailFile);
        finalThumbnailUrl = s3_key;
      }

      await createMutation.mutateAsync({
        name: name.trim(),
        brand: brand.trim() || undefined,
        model: model.trim() || undefined,
        price: price ? Number(price) : undefined,
        currency,
        description: description.trim() || undefined,
        thumbnail_url: finalThumbnailUrl || undefined,
      });

      // Reset form
      setName(""); setBrand(""); setModel(""); setPrice("");
      setCurrency("THB"); setDescription("");
      setThumbnailUrl(""); setThumbnailFile(null); setThumbnailPreview("");
      setFormOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create product");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ fontFamily: "sans-serif", maxWidth: 430, margin: "0 auto", minHeight: "100vh", background: "#FAFAF8" }}>
      {/* Header */}
      <div style={{ background: "#1A1A18", padding: "20px 20px 16px" }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 }}>
          HouseMind
        </div>
        <div style={{ fontSize: 20, fontWeight: 600, color: "#fff" }}>My Products</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
          {auth.role} · {products.length} product{products.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Add product button */}
      <div style={{ padding: "16px 20px 0" }}>
        <button
          onClick={() => setFormOpen((v) => !v)}
          style={{
            width: "100%", height: 44,
            background: formOpen ? "#F5F4F0" : "#1A1A18",
            border: formOpen ? "0.5px solid #E8E6E0" : "none",
            borderRadius: 12, color: formOpen ? "#888" : "#fff",
            fontSize: 13, fontWeight: 500, cursor: "pointer",
          }}
        >
          {formOpen ? "× Cancel" : "+ Add Product"}
        </button>
      </div>

      {/* Add product form */}
      {formOpen && (
        <div style={{
          margin: "12px 20px 0",
          background: "#fff", border: "0.5px solid #E8E6E0",
          borderRadius: 14, padding: 16,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, color: "#1A1A18" }}>
            New Product
          </div>

          {/* Thumbnail */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Thumbnail
            </div>
            {thumbnailPreview && (
              <div style={{ width: "100%", height: 160, borderRadius: 10, overflow: "hidden", marginBottom: 8, background: "#F5F4F0" }}>
                <img src={thumbnailPreview} alt="preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <label style={{
                flex: 1, height: 36, background: "#F5F4F0",
                border: "0.5px solid #E8E6E0", borderRadius: 8,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, color: "#555", cursor: "pointer",
              }}>
                📁 Upload file
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileChange} />
              </label>
              <span style={{ alignSelf: "center", color: "#bbb", fontSize: 11 }}>or</span>
              <input
                style={{ flex: 2, height: 36, border: "0.5px solid #E8E6E0", borderRadius: 8, padding: "0 10px", fontSize: 12, fontFamily: "inherit" }}
                placeholder="Paste image URL"
                value={thumbnailUrl}
                onChange={(e) => handleUrlChange(e.target.value)}
              />
            </div>
          </div>

          {/* Fields */}
          {[
            { label: "Name *", value: name, set: setName, type: "text" },
            { label: "Brand", value: brand, set: setBrand, type: "text" },
            { label: "Model", value: model, set: setModel, type: "text" },
            { label: "Price", value: price, set: setPrice, type: "number" },
            { label: "Description", value: description, set: setDescription, type: "text" },
          ].map(({ label, value, set, type }) => (
            <div key={label} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
              <input
                type={type}
                value={value}
                onChange={(e) => set(e.target.value)}
                style={{
                  width: "100%", height: 38, border: "0.5px solid #E8E6E0",
                  borderRadius: 8, padding: "0 12px", fontSize: 13,
                  fontFamily: "inherit", outline: "none", background: "#fff",
                  boxSizing: "border-box",
                }}
              />
            </div>
          ))}

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Currency</div>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              style={{
                width: "100%", height: 38, border: "0.5px solid #E8E6E0",
                borderRadius: 8, padding: "0 12px", fontSize: 13,
                fontFamily: "inherit", background: "#fff",
              }}
            >
              <option value="THB">THB</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </div>

          {error && <div style={{ fontSize: 12, color: "#E24B4A", marginBottom: 10 }}>{error}</div>}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              width: "100%", height: 44, background: "#1A1A18",
              border: "none", borderRadius: 12, color: "#fff",
              fontSize: 13, fontWeight: 500, cursor: "pointer",
              opacity: submitting ? 0.5 : 1,
            }}
          >
            {submitting ? "Saving…" : "Save Product"}
          </button>
        </div>
      )}

      {/* Product list */}
      <div style={{ padding: "16px 20px 80px" }}>
        {isLoading && <div style={{ padding: 32, textAlign: "center" }}><div className="spinner" /></div>}
        {!isLoading && products.length === 0 && !formOpen && (
          <div style={{ padding: "48px 0", textAlign: "center", color: "#bbb", fontSize: 13 }}>
            No products yet — add your first one
          </div>
        )}
        {products.map((p) => {
          const expanded = expandedId === p.id;
          return (
            <div
              key={p.id}
              style={{
                background: "#fff", border: "0.5px solid #E8E6E0",
                borderRadius: 14, marginBottom: 10, overflow: "hidden",
              }}
            >
              {/* Card row */}
              <div
                style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 14px", cursor: "pointer" }}
                onClick={() => setExpandedId(expanded ? null : p.id)}
              >
                <div style={{
                  width: 52, height: 52, borderRadius: 8,
                  background: "#F5F4F0", flexShrink: 0, overflow: "hidden",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {p.thumbnail_url
                    ? <img src={p.thumbnail_url} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <span style={{ fontSize: 20 }}>{p.name[0]}</span>
                  }
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#1A1A18", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {p.name}
                  </div>
                  {p.brand && <div style={{ fontSize: 11, color: "#888" }}>{p.brand}</div>}
                  {p.price != null && (
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#8B6520" }}>
                      ฿{p.price.toLocaleString("th-TH")} {p.currency}
                    </div>
                  )}
                </div>
                <svg width="12" height="8" viewBox="0 0 12 8" fill="none" style={{ flexShrink: 0, transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
                  <path d="M1 1l5 5 5-5" stroke="#888" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>

              {/* Expanded detail */}
              {expanded && (
                <div style={{ padding: "0 14px 14px", borderTop: "0.5px solid #F5F4F0" }}>
                  {p.thumbnail_url && (
                    <div style={{ width: "100%", height: 180, borderRadius: 10, overflow: "hidden", marginBottom: 12, marginTop: 10 }}>
                      <img src={p.thumbnail_url} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                  )}
                  {[
                    { k: "Name", v: p.name },
                    { k: "Brand", v: p.brand },
                    { k: "Model", v: p.model },
                    { k: "Price", v: p.price != null ? `${p.price.toLocaleString("th-TH")} ${p.currency}` : null },
                    { k: "Description", v: p.description },
                  ].filter((r) => r.v).map((row) => (
                    <div key={row.k} style={{
                      display: "flex", justifyContent: "space-between",
                      padding: "6px 0", borderBottom: "0.5px solid #F5F4F0",
                      fontSize: 12,
                    }}>
                      <span style={{ color: "#888" }}>{row.k}</span>
                      <span style={{ color: "#1A1A18", fontWeight: 500, textAlign: "right", maxWidth: "60%" }}>{String(row.v)}</span>
                    </div>
                  ))}
                  {p.specs && Object.keys(p.specs).length > 0 && (
                    Object.entries(p.specs).map(([k, v]) => (
                      <div key={k} style={{
                        display: "flex", justifyContent: "space-between",
                        padding: "6px 0", borderBottom: "0.5px solid #F5F4F0", fontSize: 12,
                      }}>
                        <span style={{ color: "#888" }}>{k}</span>
                        <span style={{ color: "#1A1A18", fontWeight: 500 }}>{String(v)}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}