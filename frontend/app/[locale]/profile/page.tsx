/**
 * app/[locale]/profile/page.tsx — HouseMind
 * Server Component wrapper: prefetches projects, passes dehydrated state
 * to the client via HydrationBoundary so the first paint has data.
 */
import { cookies } from "next/headers";
import { HydrationBoundary } from "@/app/providers";
import { prefetchProjects } from "@/lib/prefetch";
import { ProfileClient } from "./ProfileClient";

export default async function ProfilePage() {
  // Read the httpOnly JWT cookie server-side for the internal API call.
  // This is safe — we never expose the token to the client HTML.
  const cookieStore = await cookies();
  const token = cookieStore.get("hm_token")?.value;

  const { dehydratedState } = await prefetchProjects(token);

  return (
    <HydrationBoundary state={dehydratedState}>
      <ProfileClient />
    </HydrationBoundary>
  );
}