// hooks/useProjects.ts — HouseMind
import { useQuery } from "@tanstack/react-query";
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