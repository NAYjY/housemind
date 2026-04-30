/**
 * lib/queryClient.ts — HouseMind
 * React Query client — global defaults + SSR-safe singleton.
 *
 * staleTime contract (S3 presign expiry alignment):
 *   annotations   5 min    (refreshed on mutation invalidation)
 *   product       55 min   (thumbnail presign valid 1 hr)
 *   image URL     10 min   (presign valid 15 min, buffer 5 min)
 */
import { QueryClient } from "@tanstack/react-query";

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        retry: 2,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: { retry: 0 },
    },
  });
}

let browserClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  if (typeof window === "undefined") return makeQueryClient();
  if (!browserClient) browserClient = makeQueryClient();
  return browserClient;
}

/**
 * Server-only: returns a fresh QueryClient per request.
 * Use this in Server Components that prefetch data, then pass
 * dehydrate(client) into HydrationBoundary.
 *
 * Do NOT call this on the client — use getQueryClient() instead.
 */
export function getServerQueryClient(): QueryClient {
  return makeQueryClient();
}
