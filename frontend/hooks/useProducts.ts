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
export function useProjectProducts(projectId: string) {
  return useQuery<ProductDetail[]>({
    queryKey: ["products", "project", projectId],
    queryFn: async () => {
      const res = await authFetch(`${API}/products?project_id=${projectId}`);
      if (!res.ok) throw new Error("Failed to fetch project products");
      return res.json();
    },
    enabled: !!projectId,
  });
}

// Search products
export function useProductSearch(q: string, projectId?: string) {
  return useQuery<{ items: ProductDetail[]; total: number }>({
    queryKey: ["products", "search", q, projectId],
    queryFn: async () => {
      const params = new URLSearchParams({ q });
      if (projectId) params.set("project_id", projectId);
      const res = await authFetch(`${API}/products/search?${params}`);
      if (!res.ok) throw new Error("Failed to search products");
      return res.json();
    },
    enabled: q.length >= 0,
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
      // Step 1: get presigned URL
      const presignRes = await authFetch(`${API}/products/thumbnail-url`, {
        method: "POST",
        body: JSON.stringify({
          filename: file.name,
          content_type: file.type,
        }),
      });
      if (!presignRes.ok) throw new Error("Could not get upload URL");
      const { upload_url, s3_key } = await presignRes.json();

      // Step 2: PUT to S3
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

// Link product to project
export function useLinkProduct(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (productId: string) => {
      const res = await authFetch(`${API}/products/link`, {
        method: "POST",
        body: JSON.stringify({ project_id: projectId, product_id: productId }),
      });
      if (res.status === 409) return; // already linked, fine
      if (!res.ok) throw new Error("Failed to link product");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products", "project", projectId] });
    },
  });
}

// Unlink product from project
export function useUnlinkProduct(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (objectProductId: string) => {
      const res = await authFetch(`${API}/products/link/${objectProductId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to unlink product");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products", "project", projectId] });
    },
  });
}