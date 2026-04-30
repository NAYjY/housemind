import { cookies } from "next/headers";

const API_INTERNAL =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "";

export async function serverFetch<T>(path: string): Promise<T | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("hm_token")?.value;

  if (!token) return null;

  try {
    const res = await fetch(`${API_INTERNAL}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}