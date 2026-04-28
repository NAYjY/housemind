// hooks/useProjects.ts — HouseMind
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth";

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export interface ProjectListItem {
  id: string;
  name: string;
  status: string;
  parent_project_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectDetail extends ProjectListItem {
  architect_id: string;
  description: string | null;
  subprojects: ProjectListItem[];
}

/** GET /projects — returns the architect's top-level projects */
export function useProjects() {
  return useQuery<ProjectListItem[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await authFetch(`${API}/projects`);
      if (!res.ok) throw new Error("Failed to fetch projects");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** POST /projects — architect creates a new top-level project */
export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name: string; description?: string }) => {
      const res = await authFetch(`${API}/projects`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? "Failed to create project");
      }
      return res.json() as Promise<ProjectDetail>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

/** GET /projects/{projectId} — detail + subprojects list */
export function useProjectDetail(projectId: string) {
  return useQuery<ProjectDetail>({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const res = await authFetch(`${API}/projects/${projectId}`);
      if (!res.ok) throw new Error("Failed to fetch project");
      return res.json();
    },
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });
}

/** POST /projects/{parentId}/sub — create subproject under a main project */
export function useCreateSubProject(parentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name: string; description?: string }) => {
      const res = await authFetch(`${API}/projects/${parentId}/sub`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? "Failed to create subproject");
      }
      return res.json() as Promise<ProjectDetail>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", parentId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
  
}
/** DELETE /projects/{projectId} — delete a subproject */
export function useDeleteSubProject(parentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (subProjectId: string) => {
      const res = await authFetch(`${API}/projects/${subProjectId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? "Failed to delete subproject");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", parentId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}