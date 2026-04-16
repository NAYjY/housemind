// store/annotationStore.ts
import { create } from "zustand";
import { devtools } from "zustand/middleware";

// Field names use snake_case to match backend JSON response directly.
// BLK-7 fix: aligned to actual DB/backend column names.
export interface Annotation {
  id: string;
  image_id: string;
  linked_product_id: string | null;
  thumbnail_url: string;       // pre-signed S3 URL
  position_x: number;          // normalized 0.0–1.0
  position_y: number;          // normalized 0.0–1.0
  created_by: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

export interface ProductDetail {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  price: number | null;
  currency: string;
  description: string | null;
  thumbnail_url: string;       // pre-signed S3 URL (55 min staleTime)
  supplier_id: string | null;
  specs: Record<string, unknown> | null;
}

interface AnnotationState {
  // Annotations per imageId
  annotationsByImage: Record<string, Annotation[]>;

  // UI state
  activePinId: string | null;
  pendingPosition: { x: number; y: number } | null; // for new annotation placement

  // Loaded product details cache (keyed by productId)
  productDetails: Record<string, ProductDetail>;

  // Actions
  setAnnotations: (imageId: string, annotations: Annotation[]) => void;
  addAnnotation: (annotation: Annotation) => void;
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void;
  deleteAnnotation: (id: string, imageId: string) => void;
  setActivePin: (id: string | null) => void;
  setPendingPosition: (pos: { x: number; y: number } | null) => void;
  cacheProductDetail: (productId: string, detail: ProductDetail) => void;
}

export const useAnnotationStore = create<AnnotationState>()(
  devtools(
    (set) => ({
      annotationsByImage: {},
      activePinId: null,
      pendingPosition: null,
      productDetails: {},

      setAnnotations: (imageId, annotations) =>
        set(
          (state) => ({
            annotationsByImage: {
              ...state.annotationsByImage,
              [imageId]: annotations,
            },
          }),
          false,
          "setAnnotations"
        ),

      addAnnotation: (annotation) =>
        set(
          (state) => {
            const existing =
              state.annotationsByImage[annotation.image_id] ?? [];
            return {
              annotationsByImage: {
                ...state.annotationsByImage,
                [annotation.image_id]: [...existing, annotation],
              },
            };
          },
          false,
          "addAnnotation"
        ),

      updateAnnotation: (id, patch) =>
        set(
          (state) => {
            const updated: Record<string, Annotation[]> = {};
            for (const [imgId, anns] of Object.entries(
              state.annotationsByImage
            )) {
              updated[imgId] = anns.map((a) =>
                a.id === id ? { ...a, ...patch } : a
              );
            }
            return { annotationsByImage: updated };
          },
          false,
          "updateAnnotation"
        ),

      deleteAnnotation: (id, imageId) =>
        set(
          (state) => ({
            annotationsByImage: {
              ...state.annotationsByImage,
              [imageId]: (state.annotationsByImage[imageId] ?? []).filter(
                (a) => a.id !== id
              ),
            },
            activePinId:
              state.activePinId === id ? null : state.activePinId,
          }),
          false,
          "deleteAnnotation"
        ),

      setActivePin: (id) =>
        set({ activePinId: id }, false, "setActivePin"),

      setPendingPosition: (pos) =>
        set({ pendingPosition: pos }, false, "setPendingPosition"),

      cacheProductDetail: (productId, detail) =>
        set(
          (state) => ({
            productDetails: {
              ...state.productDetails,
              [productId]: detail,
            },
          }),
          false,
          "cacheProductDetail"
        ),
    }),
    { name: "HouseMind:Annotations" }
  )
);
