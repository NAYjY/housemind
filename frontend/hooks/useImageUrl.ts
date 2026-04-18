"use client";

// hooks/useImageUrl.ts — HouseMind
// Uses shared authFetch from lib/auth (handles 401 redirect centrally).
// Backend presigned URLs expire after 15 min; we refresh at 10 min.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth";

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

interface RefreshedUrl {
  image_id: string;
  url: string;
  expires_in: number;
}

export function useImageUrl(imageId: string, initialUrl: string) {
  const qc = useQueryClient();

  const query = useQuery<string>({
    queryKey: ["image-url", imageId],
    queryFn: async () => {
      const res = await authFetch(`${API}/images/${imageId}/url`);
      if (!res.ok) throw new Error("Failed to refresh image URL");
      const data: RefreshedUrl = await res.json();
      return data.url;
    },
    initialData: initialUrl,
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    enabled: !!imageId,
  });

  const handleImageError = async () => {
    await qc.invalidateQueries({ queryKey: ["image-url", imageId] });
  };

  return {
    url: query.data ?? initialUrl,
    handleImageError,
    isRefreshing: query.isFetching,
  };
}
