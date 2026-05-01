"use client";

import { useAnnotationStore } from "@/store/annotationStore";
import styles from "./FilmStrip.module.css";

interface FilmThumbProps {
  imageId: string;
  url: string | null;
  index: number;
  isActive: boolean;
  onClick: () => void;
}

export function FilmThumb({ imageId, url, index, isActive, onClick }: FilmThumbProps) {
  const annotationCount = useAnnotationStore(
    (s) => (s.annotationsByImage[imageId] ?? []).length
  );

  return (
    <div
      className={`${styles.thumb} ${isActive ? styles.active : ""}`}
      onClick={onClick}
      title={`${annotationCount} annotation${annotationCount !== 1 ? "s" : ""}`}
    >
      {url && <img src={url} alt={`Reference ${index + 1}`} />}
      <span style={{ position: "relative", zIndex: 1 }}>{index + 1}</span>
      {annotationCount > 0 && (
        <span
          style={{
            position: "absolute",
            top: 3,
            right: 3,
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: "#C49A3C",
            color: "#fff",
            fontSize: 8,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2,
          }}
        >
          {annotationCount > 9 ? "9+" : annotationCount}
        </span>
      )}
    </div>
  );
}