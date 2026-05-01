// hooks/useWorkspaceState.ts
import { useState } from "react";
import type { Annotation } from "@/store/annotationStore";
import type { ProductDetail } from "@/hooks/useProducts";

export function useWorkspaceState() {
  const [filmExpanded, setFilmExpanded] = useState(false);
  const [refInput, setRefInput] = useState("");
  const [fanVisible, setFanVisible] = useState(false);
  const [fanPos, setFanPos] = useState({ x: 0, y: 0 });
  const [pendingPos, setPendingPos] = useState({ normX: 0, normY: 0 });
  const [deleteTarget, setDeleteTarget] = useState<Annotation | null>(null);
  const [activePinId, setActivePinId] = useState<string | null>(null);
  const [activeProduct, setActiveProduct] = useState<ProductDetail | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  return {
    filmExpanded, setFilmExpanded,
    refInput, setRefInput,
    fanVisible, setFanVisible,
    fanPos, setFanPos,
    pendingPos, setPendingPos,
    deleteTarget, setDeleteTarget,
    activePinId, setActivePinId,
    activeProduct, setActiveProduct,
    pickerOpen, setPickerOpen,
    showAll, setShowAll,
  };
}