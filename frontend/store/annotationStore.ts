// store/annotationStore.ts
import { create } from "zustand";
import { devtools } from "zustand/middleware";

export interface Annotation {
  id: string;
  image_id: string;
  object_id: number;          // 101-108, links to product group
  position_x: number;
  position_y: number;
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
  thumbnail_url: string;
  supplier_id: string | null;
  specs: Record<string, unknown> | null;
}

interface AnnotationState {
  annotationsByImage: Record<string, Annotation[]>;
  activePinId: string | null;
  productDetails: Record<string, ProductDetail>;

  setAnnotations: (imageId: string, annotations: Annotation[]) => void;
  addAnnotation: (annotation: Annotation) => void;
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void;
  deleteAnnotation: (id: string, imageId: string) => void;
  setActivePin: (id: string | null) => void;
  cacheProductDetail: (productId: string, detail: ProductDetail) => void;
}

export const useAnnotationStore = create<AnnotationState>()(
  devtools(
    (set) => ({
      annotationsByImage: {},
      activePinId: null,
      productDetails: {},

      setAnnotations: (imageId, annotations) =>
        set((state) => ({
          annotationsByImage: { ...state.annotationsByImage, [imageId]: annotations },
        }), false, "setAnnotations"),

      addAnnotation: (annotation) =>
        set((state) => {
          const existing = state.annotationsByImage[annotation.image_id] ?? [];
          return {
            annotationsByImage: {
              ...state.annotationsByImage,
              [annotation.image_id]: [...existing, annotation],
            },
          };
        }, false, "addAnnotation"),

      updateAnnotation: (id, patch) =>
        set((state) => {
          const updated: Record<string, Annotation[]> = {};
          for (const [imgId, anns] of Object.entries(state.annotationsByImage)) {
            updated[imgId] = anns.map((a) => (a.id === id ? { ...a, ...patch } : a));
          }
          return { annotationsByImage: updated };
        }, false, "updateAnnotation"),

      deleteAnnotation: (id, imageId) =>
        set((state) => ({
          annotationsByImage: {
            ...state.annotationsByImage,
            [imageId]: (state.annotationsByImage[imageId] ?? []).filter((a) => a.id !== id),
          },
          activePinId: state.activePinId === id ? null : state.activePinId,
        }), false, "deleteAnnotation"),

      setActivePin: (id) => set({ activePinId: id }, false, "setActivePin"),

      cacheProductDetail: (productId, detail) =>
        set((state) => ({
          productDetails: { ...state.productDetails, [productId]: detail },
        }), false, "cacheProductDetail"),
    }),
    { name: "HouseMind:Annotations" }
  )
);