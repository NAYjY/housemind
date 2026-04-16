// hooks/useAnnotations.ts
//
// BLK-2 fix: API URLs updated to match backend route contract:
//   GET    /api/v1/annotations?image_id=  (was /api/images/:id/annotations)
//   POST   /api/v1/annotations            (was /api/images/:id/annotations)
//   DELETE /api/v1/annotations/:id        (was /api/images/:id/annotations/:id)
//   GET    /api/v1/products/:id           (was /api/products/:id)
//
// BLK-3 fix: Authorization: Bearer header added to all API calls via authFetch()
//
// BLK-4 fix: env var renamed NEXT_PUBLIC_API_URL → NEXT_PUBLIC_API_BASE_URL

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAnnotationStore, Annotation, ProductDetail } from "@/store/annotationStore";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

// ─── Auth header helper ──────────────────────────────────────────────────────
// JWT is stored in localStorage under "hm_token" after magic-link redemption.
// All protected API calls must include this header.

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("hm_token");
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...authHeaders(),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });

  // 403 with no error_code = S3 presign expired (not an auth error)
  // 403 with error_code = ACCESS_DENIED → permission error, do not retry
  if (res.status === 401) {
    // Token expired or invalid — clear and redirect to re-auth
    localStorage.removeItem("hm_token");
    window.location.href = "/auth/expired";
  }

  return res;
}

// ─── Annotation hooks ────────────────────────────────────────────────────────

export function useAnnotations(imageId: string) {
  const setAnnotations = useAnnotationStore((s) => s.setAnnotations);

  return useQuery({
    queryKey: ["annotations", imageId],
    queryFn: async () => {
      const res = await authFetch(
        `${API_BASE}/annotations?image_id=${imageId}`
      );
      if (!res.ok) throw new Error("Failed to fetch annotations");
      // Backend returns: id, image_id, linked_product_id, thumbnail_url,
      //                  position_x, position_y, created_by, created_at,
      //                  resolved_at, resolved_by
      const data: Annotation[] = await res.json();
      setAnnotations(imageId, data);
      return data;
    },
    enabled: !!imageId,
  });
}

export function useCreateAnnotation(imageId: string) {
  const qc = useQueryClient();
  const addAnnotation = useAnnotationStore((s) => s.addAnnotation);

  return useMutation({
    mutationFn: async (payload: {
      positionX: number;
      positionY: number;
      linkedProductId?: string | null;
    }) => {
      const res = await authFetch(`${API_BASE}/annotations`, {
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
      const res = await authFetch(`${API_BASE}/annotations/${annotationId}`, {
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
      const res = await authFetch(
        `${API_BASE}/annotations/${annotationId}/resolve`,
        { method: "PATCH", body: JSON.stringify({}) }
      );
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
      const res = await authFetch(
        `${API_BASE}/annotations/${annotationId}/reopen`,
        { method: "PATCH" }
      );
      if (!res.ok) throw new Error("Failed to reopen annotation");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["annotations", imageId] });
    },
  });
}

// ─── Product detail lazy hook ─────────────────────────────────────────────────
// Called ONLY when user taps a pin — never on page load.
// staleTime override: 3_300_000 ms (55 min) per backend S3 expiry contract.

export function useProductDetail(productId: string | null) {
  const cacheProductDetail = useAnnotationStore((s) => s.cacheProductDetail);
  const cachedDetail = useAnnotationStore((s) =>
    productId ? s.productDetails[productId] : undefined
  );

  return useQuery({
    queryKey: ["product", productId],
    queryFn: async () => {
      const res = await authFetch(`${API_BASE}/products/${productId}`);
      if (!res.ok) throw new Error("Failed to fetch product detail");
      const data: ProductDetail = await res.json();
      cacheProductDetail(productId!, data);
      return data;
    },
    enabled: !!productId && !cachedDetail,
    placeholderData: cachedDetail,
    // Thumbnail presigned URLs valid 1hr; refresh before expiry
    staleTime: 3_300_000, // 55 min
  });
}
