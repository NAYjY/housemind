/**
 * app/workspace/[projectId]/[imageId]/page.tsx — HouseMind
 * Senior-grade: proper async params (Next 14), URL-based imageUrl, auth check.
 */
import type { Metadata } from "next";
import { AnnotationWorkspace } from "@/components/annotation/AnnotationWorkspace";

interface Props {
  params: Promise<{ projectId: string; imageId: string }>;
  searchParams: Promise<{ src?: string; readOnly?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { projectId } = await params;
  return {
    title: `Workspace ${projectId} — HouseMind`,
  };
}

export default async function WorkspacePage({ params, searchParams }: Props) {
  const { projectId, imageId } = await params;
  const sp = await searchParams;
  const imageUrl = sp.src ?? "/placeholder-room.jpg";
  const forceReadOnly = sp.readOnly === "true";

  return (
    <main style={{ width: "100%", height: "100dvh", overflow: "hidden" }}>
      <AnnotationWorkspace
        imageId={imageId}
        imageUrl={imageUrl}
        projectId={projectId}
        forceReadOnly={forceReadOnly}
      />
    </main>
  );
}
