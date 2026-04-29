// components/workspace/FanEmojiMenu.tsx
"use client";

export const OBJECT_DEFS: Record<number, { emoji: string; label: string }> = {
  101: { emoji: "😊", label: "Smile" },
  102: { emoji: "⭐", label: "Star" },
  103: { emoji: "❤️", label: "Heart" },
  104: { emoji: "📷", label: "Camera" },
  105: { emoji: "🌿", label: "Leaf" },
  106: { emoji: "🗺️", label: "Map" },
  107: { emoji: "💵", label: "Dollar" },
  108: { emoji: "🏷️", label: "Tag" },
};

export const OBJECT_IDS = Object.keys(OBJECT_DEFS).map(Number);

interface Props {
  pos: { x: number; y: number };
  onPick: (objectId: number) => void;
  onClose: () => void;
}

const RADIUS = 72;

export function FanEmojiMenu({ pos, onPick, onClose }: Props) {
  const count = OBJECT_IDS.length;

  return (
  <>
    <div className="hm-fan-overlay" onClick={onClose} />
    <div
      className="hm-fan-root"
      style={{ left: pos.x, top: pos.y }}
    >
      {OBJECT_IDS.map((objectId, i) => {
        const angle = 180 + (i / (count - 1)) * 180;
        const rad = (angle * Math.PI) / 180;
        const x = Math.cos(rad) * RADIUS;
        const y = Math.sin(rad) * RADIUS;
        const def = OBJECT_DEFS[objectId];
        return (
          <button
            key={objectId}
            onClick={() => onPick(objectId)}
            title={def.label}
            className="hm-fan-btn"
            style={{ left: x, top: y }}
          >
            {def.emoji}
          </button>
        );
      })}
      <div className="hm-fan-dot" />
    </div>
  </>
);
}