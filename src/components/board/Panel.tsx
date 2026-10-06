import { useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

export function Panel({
  title,
  onClose,
  initial,
  children,
  width,
}: {
  title: string;
  onClose: () => void;
  initial: { x: number; y: number };
  children: ReactNode;
  width: number;
}) {
  const [pos, setPos] = useState(initial);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  return (
    <div
      className="absolute z-40 rounded-xl border border-border bg-card text-card-foreground shadow-[var(--shadow-panel)]"
      style={{ left: pos.x, top: pos.y, width }}
    >
      <div
        className="flex cursor-move touch-none select-none items-center justify-between rounded-t-xl border-b border-border bg-secondary px-3 py-2"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
        }}
        onPointerMove={(e) => {
          if (drag.current) setPos({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy });
        }}
        onPointerUp={() => (drag.current = null)}
      >
        <span className="font-display text-sm font-semibold tracking-wide">{title}</span>
        <button onClick={onClose} onPointerDown={(e) => e.stopPropagation()} className="rounded p-1 hover:bg-accent" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}
