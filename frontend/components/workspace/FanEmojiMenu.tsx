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
      <div style={{ position: "fixed", inset: 0, zIndex: 100 }} onClick={onClose} />
      <div
        style={{
          position: "fixed",
          left: pos.x,
          top: pos.y,
          zIndex: 101,
          transform: "translate(-50%, -50%)",
        }}
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
              style={{
                position: "absolute",
                left: x,
                top: y,
                transform: "translate(-50%, -50%)",
                width: 42,
                height: 42,
                borderRadius: "50%",
                background: "#fff",
                border: "2px solid #555",
                fontSize: 20,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                zIndex: 102,
              }}
            >
              {def.emoji}
            </button>
          );
        })}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            transform: "translate(-50%, -50%)",
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: "#555",
          }}
        />
      </div>
    </>
  );
}