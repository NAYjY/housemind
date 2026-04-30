"use client";
/**
 * app/providers.tsx — HouseMind
 * QueryClientProvider using SSR-safe singleton from lib/queryClient.ts
 * HydrationBoundary is imported here so server pages can pass dehydratedState
 * through the layout without the "No QueryClient set" error.
 */
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { HydrationBoundary } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/queryClient";

export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}

/**
 * Re-export HydrationBoundary as a client-safe component.
 * Import from here in Server Components instead of directly from
 * @tanstack/react-query to guarantee it always renders inside the provider.
 */
export { HydrationBoundary };