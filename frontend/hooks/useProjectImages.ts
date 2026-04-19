"use client";

import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth";

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export interface ProjectImage {
  id: string;
  project_id: string;
  url: string | null;
  original_filename: string | null;
  mime_type: string;
  display_order: number;
  created_at: string;
}

export function useProjectImages(projectId: string) {
  return useQuery<ProjectImage[]>({
    queryKey: ["project-images", projectId],
    queryFn: async () => {
      const res = await authFetch(`${API}/images?project_id=${projectId}`);
      if (!res.ok) throw new Error("Failed to fetch project images");
      return res.json();
    },
    enabled: !!projectId && projectId !== "demo",
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}