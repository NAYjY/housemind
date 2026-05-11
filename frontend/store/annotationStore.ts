// store/annotationStore.ts
import { create } from "zustand";
import { devtools } from "zustand/middleware";

type ResolutionState = "OPEN" | "PARTIAL" | "RESOLVED";

interface AnnotationResolution {
  id: string;
  annotation_id: string;
  user_id: string | null;
  role: string;
  resolved_at: string;
  unresolved_at: string | null;
  is_resolved: boolean;
}

export interface Annotation {
  id: string;
  image_id: string;
  object_id: number;
  position_x: number;
  position_y: number;
  created_by: string | null;
  created_at: string;
  // resolution
  resolution_state: ResolutionState;
  required_roles: string[];
  resolutions: AnnotationResolution[];
}



interface AnnotationState {
  annotationsByImage: Record<string, Annotation[]>;
  activePinId: string | null;
  

  setAnnotations: (imageId: string, annotations: Annotation[]) => void;
  addAnnotation: (annotation: Annotation) => void;
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void;
  deleteAnnotation: (id: string, imageId: string) => void;
  setActivePin: (id: string | null) => void;
  
}

export const useAnnotationStore = create<AnnotationState>()(
  devtools(
    (set) => ({
      annotationsByImage: {},
      activePinId: null,
      

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

      
    }),
    { name: "HouseMind:Annotations" }
  )
);