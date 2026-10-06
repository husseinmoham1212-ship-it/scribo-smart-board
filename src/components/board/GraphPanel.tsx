import { useEffect, useRef, useState } from "react";
import { compile } from "mathjs";
import { Plus, Trash2, ZoomIn, ZoomOut } from "lucide-react";

const COLORS = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c"];

export function GraphPanel() {
  const [items, setItems] = useState<string[]>(["2x + 1", "x^2 - 4", "(3, 2)"]);
  const [range, setRange] = useState(10);
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    const W = c.width, H = c.height;
    const sx = (x: number) => ((x + range) / (2 * range)) * W;
    const sy = (y: number) => H - ((y + range) / (2 * range)) * H;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
    const step = range <= 10 ? 1 : range <= 25 ? 5 : 10;
    ctx.lineWidth = 1; ctx.strokeStyle = "#e5e7eb"; ctx.font = "10px monospace"; ctx.fillStyle = "#6b7280";
    for (let v = -Math.floor(range / step) * step; v <= range; v += step) {
      ctx.beginPath(); ctx.moveTo(sx(v), 0); ctx.lineTo(sx(v), H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, sy(v)); ctx.lineTo(W, sy(v)); ctx.stroke();
      if (v !== 0) { ctx.fillText(String(v), sx(v) + 2, sy(0) + 11); ctx.fillText(String(v), sx(0) + 3, sy(v) - 2); }
    }
    ctx.strokeStyle = "#111"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(sx(0), 0); ctx.lineTo(sx(0), H); ctx.moveTo(0, sy(0)); ctx.lineTo(W, sy(0)); ctx.stroke();
    items.forEach((raw, i) => {
      const col = COLORS[i % COLORS.length]!;
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2;
      const pt = raw.match(/^\s*\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)\s*$/);
      if (pt) {
        const x = Number(pt[1]), y = Number(pt[2]);
        ctx.beginPath(); ctx.arc(sx(x), sy(y), 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillText(`(${x}, ${y})`, sx(x) + 6, sy(y) - 6);
        return;
      }
      try {
        const e = raw.replace(/^\s*y\s*=/, "").replace(/(\d)([a-z(])/gi, "$1*$2");
        const f = compile(e);
        ctx.beginPath(); let started = false;
        for (let px = 0; px <= W; px++) {
          const x = (px / W) * 2 * range - range;
          const y = Number(f.evaluate({ x }));
          if (!isFinite(y) || Math.abs(y) > range * 10) { started = false; continue; }
          if (!started) { ctx.moveTo(px, sy(y)); started = true; } else ctx.lineTo(px, sy(y));
        }
        ctx.stroke();
      } catch { /* invalid */ }
    });
  }, [items, range]);

  return (
    <div className="space-y-2">
      <canvas ref={ref} width={340} height={300} className="w-full rounded-md border border-border" />
      <div className="flex items-center gap-1">
        <button className="rounded-md border border-border p-1.5 hover:bg-accent" onClick={() => setRange((r) => Math.max(2, r / 2))} aria-label="Zoom in"><ZoomIn className="h-4 w-4" /></button>
        <button className="rounded-md border border-border p-1.5 hover:bg-accent" onClick={() => setRange((r) => Math.min(200, r * 2))} aria-label="Zoom out"><ZoomOut className="h-4 w-4" /></button>
        <span className="ml-1 text-xs text-muted-foreground">−{range} to {range}</span>
        <button className="ml-auto flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground" onClick={() => setItems((i) => [...i, ""])}>
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
          <span className="text-xs text-muted-foreground">y =</span>
          <input
            value={it}
            onChange={(e) => setItems((arr) => arr.map((v, j) => (j === i ? e.target.value : v)))}
            className="w-full rounded-md border border-input bg-background px-2 py-1 font-mono text-xs"
            placeholder="e.g. 3x - 2  or  (1, 4)"
          />
          <button onClick={() => setItems((arr) => arr.filter((_, j) => j !== i))} className="p-1 text-muted-foreground hover:text-destructive" aria-label="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      ))}
    </div>
  );
}
