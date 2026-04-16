"use client";

/**
 * hooks/useImageUrl.ts — HouseMind
 * Manages presigned S3 URL lifecycle for project images.
 *
 * Backend presigned URLs expire after 15 minutes.
 * React Query staleTime is set to 10 minutes (600 000 ms) so we refresh
 * before expiry. On a 403 from S3 (no error_code field), we force-refetch.
 *
 * Error code contract (from backend):
 *   403 with    error_code = ACCESS_DENIED → permission error, do not retry
 *   403 without error_code                → S3 URL expired → call /images/:id/url
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

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
      const res = await authFetch(`${API_BASE}/images/${imageId}/url`);
      if (!res.ok) throw new Error("Failed to refresh image URL");
      const data: RefreshedUrl = await res.json();
      return data.url;
    },
    // Don't fetch on mount — use initialUrl until it expires
    initialData: initialUrl,
    // Refresh at 10 min (URL valid for 15 min — refresh before expiry)
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    enabled: !!imageId,
  });

  /** Call this when the <Image> component gets a 403 — forces an immediate refresh */
  const handleImageError = async () => {
    await qc.invalidateQueries({ queryKey: ["image-url", imageId] });
  };

  return {
    url: query.data ?? initialUrl,
    handleImageError,
    isRefreshing: query.isFetching,
  };
}
