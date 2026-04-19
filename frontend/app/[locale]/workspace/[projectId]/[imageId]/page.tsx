// app/workspace/[projectId]/[imageId]/page.tsx
import type { Metadata } from "next";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";

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
  
  return (
    <WorkspaceShell
      imageId={imageId}
      imageUrl={imageUrl}
      projectId={projectId}
      forceReadOnly={forceReadOnly}
    />
  );
}
