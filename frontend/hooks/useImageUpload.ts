// hooks/useImageUpload.ts
"use client";

import { useState, useCallback } from "react";
import { authFetch } from "@/lib/auth";

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

interface UseImageUploadOptions {
  projectId: string;
  isAuthenticated: boolean;
  onSuccess: () => void; // caller calls refetchImages + resetSeed
}

export function useImageUpload({ projectId, isAuthenticated, onSuccess }: UseImageUploadOptions) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const uploadFile = useCallback(
    async (file: File) => {
      if (!isAuthenticated) {
        setUploadError("Sign in to upload.");
        return;
      }
      setUploading(true);
      setUploadError("");
      try {
        const presignRes = await authFetch(`${API}/images/upload-url?project_id=${projectId}`, {
          method: "POST",
          body: JSON.stringify({
            project_id: projectId,
            filename: file.name,
            content_type: file.type,
          }),
        });
        if (!presignRes.ok) throw new Error("Could not get upload URL");
        const { upload_url, s3_key } = await presignRes.json();

        const s3Res = await fetch(upload_url, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        });
        if (!s3Res.ok) throw new Error("S3 upload failed");

        const confirmRes = await authFetch(`${API}/images/confirm?project_id=${projectId}`, {
          method: "POST",
          body: JSON.stringify({
            project_id: projectId,
            s3_key,
            original_filename: file.name,
            mime_type: file.type,
          }),
        });
        if (!confirmRes.ok) throw new Error("Confirmation failed");
        onSuccess();
      } catch (err: unknown) {
        setUploadError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [projectId, isAuthenticated, onSuccess]
  );

  const submitUrl = useCallback(
    async (url: string, onLocalFallback: (url: string) => void) => {
      if (!url.trim()) return;
      if (isAuthenticated) {
        try {
          const res = await authFetch(`${API}/images/from-url?project_id=${projectId}`, {
            method: "POST",
            body: JSON.stringify({
              project_id: projectId,
              url,
              original_filename: url.split("/").pop(),
            }),
          });
          if (res.ok) {
            onSuccess();
            return;
          }
        } catch {
          /* fall through to local */
        }
      }
      onLocalFallback(url);
    },
    [projectId, isAuthenticated, onSuccess]
  );

  return { uploading, uploadError, uploadFile, submitUrl };
}