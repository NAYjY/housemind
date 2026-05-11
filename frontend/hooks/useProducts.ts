// hooks/useProducts.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth";

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export interface ProductDetail {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  price: number | null;
  currency: string;
  description: string | null;
  thumbnail_url: string;
  supplier_id: string | null;
  specs: Record<string, unknown> | null;
}

export interface ProductCreatePayload {
  name: string;
  brand?: string;
  model?: string;
  price?: number;
  currency?: string;
  description?: string;
  thumbnail_url?: string;
  specs?: Record<string, unknown>;
}

// My products (supplier/architect)
export function useMyProducts() {
  return useQuery<ProductDetail[]>({
    queryKey: ["products", "my"],
    queryFn: async () => {
      const res = await authFetch(`${API}/products/my`);
      if (!res.ok) throw new Error("Failed to fetch products");
      return res.json();
    },
  });
}

// Project products (all products linked to project)
export function useProjectProducts(projectId: string, objectId?: number | null) {
  return useQuery<ProductDetail[]>({
    queryKey: ["products", "project", projectId, objectId ?? "all"],
    queryFn: async () => {
      const params = new URLSearchParams({ project_id: projectId });
      if (objectId != null) params.set("object_id", String(objectId));
      const res = await authFetch(`${API}/products?${params}`);
      if (!res.ok) throw new Error("Failed to fetch project products");
      return res.json();
    },
    enabled: !!projectId,
  });
}

// Search products — searches GLOBAL catalogue for the picker modal
export function useProductSearch(q: string) {
  return useQuery<{ items: ProductDetail[]; total: number }>({
    queryKey: ["products", "catalogue", q],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      const res = await authFetch(`${API}/products/catalogue?${params}`);
      if (!res.ok) throw new Error("Failed to search products");
      return res.json();
    },
    enabled: true,
    staleTime: 30_000,
  });
}

// Create product
export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ProductCreatePayload) => {
      const res = await authFetch(`${API}/products`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to create product");
      return res.json() as Promise<ProductDetail>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products", "my"] });
    },
  });
}

// Get thumbnail upload URL
export function useProductThumbnailUpload() {
  return useMutation({
    mutationFn: async (file: File) => {
      const presignRes = await authFetch(`${API}/products/thumbnail-url`, {
        method: "POST",
        body: JSON.stringify({
          filename: file.name,
          content_type: file.type,
        }),
      });
      if (!presignRes.ok) throw new Error("Could not get upload URL");
      const { upload_url, s3_key } = await presignRes.json();

      const s3Res = await fetch(upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!s3Res.ok) throw new Error("S3 upload failed");

      return s3_key as string;
    },
  });
}

// useLinkProduct — FIX: project_id must be a query param so require_project_architect
// can read it from request.query_params. Sending it only in the JSON body is
// invisible to the FastAPI dependency.
export function useLinkProduct(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, objectId }: { productId: string; objectId: number }) => {
      // ✅ project_id in query string (required by require_project_architect)
      const res = await authFetch(`${API}/products/link?project_id=${projectId}`, {
        method: "POST",
        body: JSON.stringify({
          project_id: projectId,  // also in body for ObjectProductCreate schema
          object_id: objectId,
          product_id: productId,
        }),
      });
      if (res.status === 409) return; // already linked — idempotent, not an error
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? "Failed to link product");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products", "project", projectId] });
    },
  });
}

export function useProductDetail(productId: string | null) {
  return useQuery({
    queryKey: ["product", productId],
    queryFn: async () => {
      const res = await authFetch(`${API}/products/${productId}`);
      if (!res.ok) throw new Error("Failed to fetch product");
      return res.json();
    },
    enabled: !!productId,
    staleTime: 3_300_000,
  });
}

/** DELETE /products/{productId} — delete own product */
export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (productId: string) => {
      const res = await authFetch(`${API}/products/${productId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete product");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products", "my"] });
    },
  });
}



/** DELETE /products/link-by-product — unlink by product+object+project */
export function useUnlinkProductByProductId(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, objectId }: { productId: string; objectId: number }) => {
      const res = await authFetch(
        `${API}/products/link-by-product?project_id=${projectId}&product_id=${productId}&object_id=${objectId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to unlink product");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products", "project", projectId] });
    },
  });
}