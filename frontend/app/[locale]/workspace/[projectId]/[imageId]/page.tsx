/**
 * app/workspace/[projectId]/[imageId]/page.tsx — HouseMind
 * Server Component wrapper: prefetches images + annotations before paint.
 */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { HydrationBoundary } from "@/app/providers";
import { prefetchWorkspace } from "@/lib/prefetch";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { WorkspaceErrorBoundary } from "@/components/workspace/WorkspaceErrorBoundary";

interface Props {
  params: Promise<{ projectId: string; imageId: string }>;
  searchParams: Promise<{ src?: string; readOnly?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { projectId } = await params;
  return { title: `HouseMind · ${projectId}` };
}

export default async function WorkspacePage({ params, searchParams }: Props) {
  const { projectId, imageId } = await params;
  const sp = await searchParams;
  const imageUrl = sp.src ?? "/placeholder-room.jpg";
  const forceReadOnly = sp.readOnly === "true";

  const cookieStore = await cookies();
  const token = cookieStore.get("hm_token")?.value;

  const { dehydratedState } = await prefetchWorkspace(projectId, imageId, token);

  return (
    <WorkspaceErrorBoundary>
      <HydrationBoundary state={dehydratedState}>
        <WorkspaceShell
          imageId={imageId}
          imageUrl={imageUrl}
          projectId={projectId}
          forceReadOnly={forceReadOnly}
        />
      </HydrationBoundary>
    </WorkspaceErrorBoundary>
  );
}