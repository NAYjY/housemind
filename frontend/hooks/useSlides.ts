// hooks/useSlides.ts
"use client";

import { useState, useEffect, useCallback } from "react";
import type { ProjectImage } from "@/hooks/useProjectImages";

export interface Slide {
  imageId: string;
  url: string;
  label: string;
}

interface UseSlidesOptions {
  initialImageId: string;
  initialImageUrl: string;
  dbImages: ProjectImage[] | undefined;
}

export function useSlides({ initialImageId, initialImageUrl, dbImages }: UseSlidesOptions) {
  const [slides, setSlides] = useState<Slide[]>(() => [
    { imageId: initialImageId, url: initialImageUrl, label: "Reference 1" },
  ]);
  const [currentSlide, setCurrentSlide] = useState(0);

  // Tracks whether DB images have seeded the slide list.
  // Must be state (not ref) so changes trigger the useEffect below.
  const [dbSeeded, setDbSeeded] = useState(false);

  useEffect(() => {
    if (dbSeeded || !dbImages || dbImages.length === 0) return;
    const newSlides: Slide[] = dbImages.map((img, i) => ({
      imageId: img.id,
      url: img.url ?? "",
      label: img.original_filename ?? `Reference ${i + 1}`,
    }));
    setSlides(newSlides);
    const idx = newSlides.findIndex((s) => s.imageId === initialImageId);
    setCurrentSlide(idx >= 0 ? idx : 0);
    setDbSeeded(true);
  }, [dbImages, initialImageId, dbSeeded]);

  const resetSeed = useCallback(() => setDbSeeded(false), []);

  const addLocalSlide = useCallback((url: string) => {
    setSlides((prev) => {
      const idx = prev.length;
      const next = [...prev, { imageId: `local-${idx}`, url, label: `Reference ${idx + 1} (session)` }];
      setCurrentSlide(idx);
      return next;
    });
  }, []);

  const prev = useCallback(
    () => setCurrentSlide((i) => (i - 1 + slides.length) % slides.length),
    [slides.length]
  );

  const next = useCallback(
    () => setCurrentSlide((i) => (i + 1) % slides.length),
    [slides.length]
  );

  return {
    slides,
    currentSlide,
    activeSlide: slides[currentSlide] ?? slides[0],
    setCurrentSlide,
    resetSeed,
    addLocalSlide,
    prev,
    next,
  };
}