/**
 * lib/prefetch.ts — HouseMind
 * Server-side prefetch helpers.
 * Import in Server Components to populate the HydrationBoundary cache.
 *
 * Usage in a Server Component:
 *   const { queryClient, dehydratedState } = await prefetchProjects(token);
 *   return (
 *     <HydrationBoundary state={dehydratedState}>
 *       <ProfilePage />
 *     </HydrationBoundary>
 *   );
 */
import { dehydrate } from "@tanstack/react-query";
import { getServerQueryClient } from "@/lib/queryClient";

const API_INTERNAL =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:8000/api/v1";

async function _apiFetch(path: string, token: string | undefined) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_INTERNAL}${path}`, {
    headers,
    // Next.js 14 fetch cache: revalidate every 5 min server-side
    next: { revalidate: 300 },
  });

  if (!res.ok) return null;
  return res.json();
}

/**
 * Prefetch GET /projects for the profile page.
 * token: the raw JWT string extracted from the incoming request cookie.
 */
export async function prefetchProjects(token: string | undefined) {
  const queryClient = getServerQueryClient();

  await queryClient.prefetchQuery({
    queryKey: ["projects"],
    queryFn: () => _apiFetch("/projects", token),
    staleTime: 5 * 60 * 1000,
  });

  return { queryClient, dehydratedState: dehydrate(queryClient) };
}

/**
 * Prefetch GET /images?project_id for the workspace page.
 */
export async function prefetchProjectImages(
  projectId: string,
  token: string | undefined
) {
  const queryClient = getServerQueryClient();

  await queryClient.prefetchQuery({
    queryKey: ["project-images", projectId],
    queryFn: () =>
      _apiFetch(`/images?project_id=${projectId}`, token),
    staleTime: 10 * 60 * 1000,
  });

  return { queryClient, dehydratedState: dehydrate(queryClient) };
}

/**
 * Prefetch both images and annotations for a specific image.
 * Used by the workspace page to avoid two sequential client waterfalls.
 */
export async function prefetchWorkspace(
  projectId: string,
  imageId: string,
  token: string | undefined
) {
  const queryClient = getServerQueryClient();

  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: ["project-images", projectId],
      queryFn: () =>
        _apiFetch(`/images?project_id=${projectId}`, token),
      staleTime: 10 * 60 * 1000,
    }),
    queryClient.prefetchQuery({
      queryKey: ["annotations", imageId],
      queryFn: () =>
        _apiFetch(`/annotations?image_id=${imageId}`, token),
      staleTime: 5 * 60 * 1000,
    }),
  ]);

  return { queryClient, dehydratedState: dehydrate(queryClient) };
}