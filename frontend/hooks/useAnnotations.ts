// hooks/useAnnotations.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth";
import { useAnnotationStore, type Annotation } from "@/store/annotationStore";

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

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
      objectId: number;
    }) => {
      if (imageId.startsWith("local-")) throw new Error("Session-only image");
      const res = await authFetch(`${API}/annotations?project_id=${projectId}`, {
        method: "POST",
        body: JSON.stringify({
          image_id: imageId,
          object_id: payload.objectId,
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
    mutationFn: async ({ annotationId, projectId }: { annotationId: string; projectId: string }) => {
      const res = await authFetch(`${API}/annotations/${annotationId}?project_id=${projectId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete annotation");
    },
    onSuccess: (_, { annotationId }) => {
      deleteAnnotation(annotationId, imageId);
      qc.invalidateQueries({ queryKey: ["annotations", imageId] });
    },
  });
}

export function useResolveAnnotation(imageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (annotationId: string) => {
      const res = await authFetch(`${API}/annotations/${annotationId}/resolve`, {
        method: "PATCH",
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Failed to resolve");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["annotations", imageId] }),
  });
}

export function useReopenAnnotation(imageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (annotationId: string) => {
      const res = await authFetch(`${API}/annotations/${annotationId}/reopen`, {
        method: "PATCH",
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Failed to reopen");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["annotations", imageId] }),
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