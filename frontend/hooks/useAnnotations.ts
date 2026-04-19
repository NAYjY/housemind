// hooks/useAnnotations.ts
//
// Integration fixes:
//   - All API calls now go through lib/auth's authFetch (handles 401 redirect)
//   - NEXT_PUBLIC_API_BASE_URL must be set to http://localhost:8000/api/v1
//   - reopen PATCH now sends body: JSON.stringify({}) to satisfy FastAPI

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth";
import { useAnnotationStore, type Annotation, type ProductDetail } from "@/store/annotationStore";

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

// ─── Annotation hooks ────────────────────────────────────────────────────────

export function useAnnotations(imageId: string) {
  const setAnnotations = useAnnotationStore((s) => s.setAnnotations);
  const isRealId = !!imageId && !imageId.startsWith("local-");
  return useQuery({
    queryKey: ["annotations", imageId],
    queryFn: async () => {
      const res = await authFetch(`${API}/annotations?image_id=${imageId}`);
      if (!res.ok) throw new Error("Failed to fetch annotations");
      const data: Annotation[] = await res.json();
      setAnnotations(imageId, data);
      return data;
    },
    enabled: isRealId,
  });
}

export function useCreateAnnotation(imageId: string, projectId: string) {
  const qc = useQueryClient();
  const addAnnotation = useAnnotationStore((s) => s.addAnnotation);

  return useMutation({
    mutationFn: async (payload: {
      positionX: number;
      positionY: number;
      linkedProductId?: string | null;
    }) => {
      if (imageId.startsWith("local-")) throw new Error("Cannot save annotations on session-only images");
      const res = await authFetch(`${API}/annotations?project_id=${projectId}`, {
        method: "POST",
        body: JSON.stringify({
          image_id: imageId,
          linked_product_id: payload.linkedProductId ?? null,
          position_x: payload.positionX,
          position_y: payload.positionY,
        }),
      });
      if (!res.ok) throw new Error("Failed to create annotation");
      return res.json() as Promise<Annotation>;
    },
    onSuccess: (annotation) => {
      addAnnotation(annotation);
      qc.invalidateQueries({ queryKey: ["annotations", imageId] });
    },
  });
}

export function useDeleteAnnotation(imageId: string) {
  const qc = useQueryClient();
  const deleteAnnotation = useAnnotationStore((s) => s.deleteAnnotation);

  return useMutation({
    mutationFn: async (annotationId: string) => {
      if (imageId.startsWith("local-")) throw new Error("Cannot save annotations on session-only images");
      const res = await authFetch(`${API}/annotations/${annotationId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete annotation");
    },
    onSuccess: (_, annotationId) => {
      deleteAnnotation(annotationId, imageId);
      qc.invalidateQueries({ queryKey: ["annotations", imageId] });
    },
  });
}

export function useResolveAnnotation(imageId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (annotationId: string) => {
      if (imageId.startsWith("local-")) throw new Error("Cannot save annotations on session-only images");
      const res = await authFetch(`${API}/annotations/${annotationId}/resolve`, {
        method: "PATCH",
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Failed to resolve annotation");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["annotations", imageId] });
    },
  });
}

export function useReopenAnnotation(imageId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (annotationId: string) => {
      if (imageId.startsWith("local-")) throw new Error("Cannot save annotations on session-only images");
      // body required — FastAPI rejects PATCH with no body when Content-Type is set
      const res = await authFetch(`${API}/annotations/${annotationId}/reopen`, {
        method: "PATCH",
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Failed to reopen annotation");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["annotations", imageId] });
    },
  });
}

// ─── Product detail hook ──────────────────────────────────────────────────────
// Lazy — only fires when user taps a pin. staleTime: 55 min (S3 expiry buffer).

export function useProductDetail(productId: string | null) {
  const cacheProductDetail = useAnnotationStore((s) => s.cacheProductDetail);
  const cachedDetail = useAnnotationStore((s) =>
    productId ? s.productDetails[productId] : undefined
  );

  return useQuery({
    queryKey: ["product", productId],
    queryFn: async () => {
      const res = await authFetch(`${API}/products/${productId}`);
      if (!res.ok) throw new Error("Failed to fetch product detail");
      const data: ProductDetail = await res.json();
      cacheProductDetail(productId!, data);
      return data;
    },
    enabled: !!productId && !cachedDetail,
    placeholderData: cachedDetail,
    staleTime: 3_300_000, // 55 min
  });
}
