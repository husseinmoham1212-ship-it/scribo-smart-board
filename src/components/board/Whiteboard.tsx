import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Calculator as CalcIcon, Eraser, LineChart, MousePointer2, Pen, Sigma, Trash2, Type, Undo2, Wand2, Loader2 } from "lucide-react";
import { recognizeHandwriting } from "@/lib/recognize.functions";
import { Panel } from "./Panel";
import { Calculator } from "./Calculator";
import { GraphPanel } from "./GraphPanel";
import { FormulaSheet } from "./FormulaSheet";

type Pt = { x: number; y: number };
type Stroke = { id: number; pts: Pt[]; color: string; size: number; erase: boolean };
type TextItem = { id: number; x: number; y: number; text: string; size: number; color: string; auto?: boolean };
type Tool = "pen" | "eraser" | "text" | "select";

const BG = [
  { n: "White", v: "#ffffff" }, { n: "Cream", v: "#fbf7ec" }, { n: "Mint", v: "#eef7f0" },
  { n: "Sky", v: "#eaf2fb" }, { n: "Grid", v: "grid" }, { n: "Chalk", v: "#1f3a2e" }, { n: "Slate", v: "#1e2430" },
];
const INK = ["#111827", "#2563eb", "#dc2626", "#16a34a", "#9333ea", "#f59e0b", "#ffffff"];
const SYMBOLS = ["√", "π", "²", "³", "≤", "≥", "≠", "×", "÷", "±", "°", "½", "∠", "△", "≈", "∞"];

let uid = 1;

export function Whiteboard() {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [texts, setTexts] = useState<TextItem[]>([]);
  const [tool, setTool] = useState<Tool>("pen");
  const [ink, setInk] = useState(INK[0]);
  const [size, setSize] = useState(3);
  const [bg, setBg] = useState("#ffffff");
  const [auto, setAuto] = useState(true);
  const [busy, setBusy] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [panels, setPanels] = useState({ calc: false, graph: false, formula: false });
  const drawing = useRef<Stroke | null>(null);
  const pending = useRef<number[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusId = useRef<number | null>(null);
  const recognize = useServerFn(recognizeHandwriting);
  const dark = bg === "#1f3a2e" || bg === "#1e2430";

  useEffect(() => setInk(dark ? "#ffffff" : "#111827"), [dark]);

  const redraw = useCallback(() => {
    const c = canvas.current, w = wrap.current;
    if (!c || !w) return;
    const dpr = window.devicePixelRatio || 1;
    const W = w.clientWidth, H = w.clientHeight;
    if (c.width !== W * dpr || c.height !== H * dpr) { c.width = W * dpr; c.height = H * dpr; }
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const all = drawing.current ? [...strokes, drawing.current] : strokes;
    for (const s of all) {
      ctx.globalCompositeOperation = s.erase ? "destination-out" : "source-over";
      ctx.strokeStyle = s.color; ctx.lineWidth = s.erase ? s.size * 6 : s.size;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath();
      s.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      if (s.pts.length === 1) ctx.lineTo(s.pts[0].x + 0.1, s.pts[0].y);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  }, [strokes]);

  useEffect(() => { redraw(); }, [redraw]);
  useEffect(() => {
    const ro = new ResizeObserver(() => redraw());
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [redraw]);

  const convert = useCallback(async () => {
    const ids = [...pending.current];
    pending.current = [];
    const group = strokesRef.current.filter((s) => ids.includes(s.id) && !s.erase);
    if (!group.length) return;
    const xs = group.flatMap((s) => s.pts.map((p) => p.x)), ys = group.flatMap((s) => s.pts.map((p) => p.y));
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad = 16, w = maxX - minX + pad * 2, h = maxY - minY + pad * 2;
    const off = document.createElement("canvas");
    const scale = Math.min(2, 800 / Math.max(w, h)) || 1;
    off.width = Math.max(32, w * scale); off.height = Math.max(32, h * scale);
    const ctx = off.getContext("2d")!;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, off.width, off.height);
    ctx.scale(scale, scale); ctx.strokeStyle = "#000"; ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const s of group) {
      ctx.lineWidth = Math.max(2.5, s.size);
      ctx.beginPath();
      s.pts.forEach((p, i) => (i ? ctx.lineTo(p.x - minX + pad, p.y - minY + pad) : ctx.moveTo(p.x - minX + pad, p.y - minY + pad)));
      ctx.stroke();
    }
    setBusy((b) => b + 1);
    try {
      const r = await recognize({ data: { image: off.toDataURL("image/png") } });
      if (r.error) setMsg(r.error);
      if (r.text) {
        setStrokes((ss) => ss.filter((s) => !ids.includes(s.id)));
        const fs = Math.max(16, Math.min(64, (maxY - minY) * 0.75));
        setTexts((t) => [...t, { id: uid++, x: minX, y: minY + (maxY - minY) / 2 - fs * 0.7, text: r.text, size: fs, color: group[0].color, auto: true }]);
      }
    } catch { setMsg("Couldn't read that handwriting."); }
    finally { setBusy((b) => b - 1); }
  }, [recognize]);

  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;

  const pos = (e: React.PointerEvent): Pt => {
    const r = wrap.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: React.PointerEvent) => {
    if (tool === "text") {
      const p = pos(e);
      const id = uid++;
      focusId.current = id;
      setTexts((t) => [...t, { id, x: p.x, y: p.y - 14, text: "", size: 24, color: ink }]);
      setTool("select");
      return;
    }
    if (tool === "select") return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (timer.current) clearTimeout(timer.current);
    drawing.current = { id: uid++, pts: [pos(e)], color: ink, size, erase: tool === "eraser" };
    redraw();
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const evs = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? [];
    if (evs.length) {
      const r = wrap.current!.getBoundingClientRect();
      evs.forEach((ev) => drawing.current!.pts.push({ x: ev.clientX - r.left, y: ev.clientY - r.top }));
    } else drawing.current.pts.push(pos(e));
    redraw();
  };
  const onUp = () => {
    const s = drawing.current;
    if (!s) return;
    drawing.current = null;
    setStrokes((ss) => [...ss, s]);
    if (auto && !s.erase) {
      pending.current.push(s.id);
      timer.current = setTimeout(convert, 900);
    }
  };

  const insertText = (t: string) => {
    const w = wrap.current!;
    setTexts((arr) => [...arr, { id: uid++, x: w.clientWidth / 2 - 150, y: 80 + (arr.length % 10) * 40, text: t, size: 24, color: ink }]);
  };

  const undo = () => {
    const lastS = strokes[strokes.length - 1]?.id ?? 0, lastT = texts[texts.length - 1]?.id ?? 0;
    if (lastS > lastT) setStrokes((s) => s.slice(0, -1)); else setTexts((t) => t.slice(0, -1));
  };

  const toolBtn = (t: Tool, Icon: typeof Pen, label: string) => (
    <button
      onClick={() => setTool(t)}
      title={label}
      aria-label={label}
      className={`flex h-10 w-10 items-center justify-center rounded-lg transition ${tool === t ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
    >
      <Icon className="h-5 w-5" />
    </button>
  );

  const bgStyle = bg === "grid"
    ? { backgroundColor: "#ffffff", backgroundImage: "linear-gradient(#e5e7eb 1px, transparent 1px), linear-gradient(90deg, #e5e7eb 1px, transparent 1px)", backgroundSize: "28px 28px" }
    : { backgroundColor: bg };

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Top bar */}
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary font-display font-bold text-primary-foreground">G</div>
          <span className="font-display text-lg font-bold tracking-tight">GED Math Board</span>
        </div>
        <div className="mx-2 h-6 w-px bg-border" />
        <div className="flex items-center gap-1">
          {INK.map((c) => (
            <button key={c} onClick={() => { setInk(c); if (tool !== "pen" && tool !== "text") setTool("pen"); }} aria-label={`Ink ${c}`}
              className={`h-6 w-6 rounded-full border border-border ${ink === c ? "ring-2 ring-primary ring-offset-2 ring-offset-card" : ""}`} style={{ background: c }} />
          ))}
        </div>
        <input type="range" min={1} max={12} value={size} onChange={(e) => setSize(+e.target.value)} className="w-24 accent-[var(--primary)]" aria-label="Pen size" />
        <div className="mx-2 h-6 w-px bg-border" />
        <span className="text-xs font-medium text-muted-foreground">Background</span>
        <div className="flex items-center gap-1">
          {BG.map((b) => (
            <button key={b.n} title={b.n} onClick={() => setBg(b.v)} aria-label={`Background ${b.n}`}
              className={`h-6 w-6 rounded-md border border-border ${bg === b.v ? "ring-2 ring-primary ring-offset-2 ring-offset-card" : ""}`}
              style={b.v === "grid" ? { backgroundColor: "#fff", backgroundImage: "linear-gradient(#cbd5e1 1px,transparent 1px),linear-gradient(90deg,#cbd5e1 1px,transparent 1px)", backgroundSize: "6px 6px" } : { background: b.v }} />
          ))}
          <input type="color" value={bg.startsWith("#") ? bg : "#ffffff"} onChange={(e) => setBg(e.target.value)} className="h-6 w-7 cursor-pointer rounded border border-border bg-transparent" aria-label="Custom background" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          {busy > 0 && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Converting…</span>}
          <button onClick={() => setAuto((a) => !a)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${auto ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
            <Wand2 className="h-3.5 w-3.5" /> Handwriting → text {auto ? "ON" : "OFF"}
          </button>
        </div>
      </header>

      {/* Question bar */}
      <div className="border-b border-border bg-secondary/60 px-4 py-2">
        <div className="flex items-start gap-2">
          <span className="mt-2 rounded bg-primary px-2 py-0.5 font-display text-xs font-bold text-primary-foreground">Q</span>
          <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2}
            placeholder="Type the question here, e.g. A rectangle has a perimeter of 36 ft and a length of 10 ft. What is its area?"
            className="min-h-[44px] flex-1 resize-y rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus:ring-2 focus:ring-ring" />
          <div className="flex max-w-[260px] flex-wrap gap-1">
            {SYMBOLS.map((s) => (
              <button key={s} onClick={() => setQuestion((q) => q + s)} className="h-7 w-7 rounded border border-border bg-background font-mono text-sm hover:bg-accent">{s}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="relative flex flex-1 overflow-hidden">
        {/* Left tools */}
        <aside className="z-30 flex w-14 flex-col items-center gap-1 border-r border-border bg-card py-3">
          {toolBtn("pen", Pen, "Pen")}
          {toolBtn("eraser", Eraser, "Eraser")}
          {toolBtn("text", Type, "Text box")}
          {toolBtn("select", MousePointer2, "Move / edit text")}
          <div className="my-2 h-px w-8 bg-border" />
          <button onClick={undo} title="Undo" aria-label="Undo" className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-accent"><Undo2 className="h-5 w-5" /></button>
          <button onClick={() => { setStrokes([]); setTexts([]); }} title="Clear board" aria-label="Clear board" className="flex h-10 w-10 items-center justify-center rounded-lg text-destructive hover:bg-accent"><Trash2 className="h-5 w-5" /></button>
        </aside>

        {/* Working area */}
        <div ref={wrap} className="relative flex-1 overflow-hidden" style={bgStyle}>
          <canvas
            ref={canvas}
            className="absolute inset-0 h-full w-full touch-none"
            style={{ cursor: tool === "text" ? "text" : tool === "select" ? "default" : "crosshair" }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          />
          {texts.map((t) => (
            <TextBox key={t.id} item={t} interactive={tool === "select"} autoFocus={focusId.current === t.id}
              onChange={(patch) => setTexts((arr) => arr.map((x) => (x.id === t.id ? { ...x, ...patch } : x)))}
              onDelete={() => setTexts((arr) => arr.filter((x) => x.id !== t.id))} />
          ))}
          {msg && (
            <button onClick={() => setMsg(null)} className="absolute bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-sm text-background shadow-lg">{msg}</button>
          )}
          {panels.calc && <Panel title="TI-30XS MultiView" width={280} initial={{ x: Math.max(16, (wrap.current?.clientWidth ?? 1000) - 300), y: 16 }} onClose={() => setPanels((p) => ({ ...p, calc: false }))}><Calculator /></Panel>}
          {panels.graph && <Panel title="Graph" width={370} initial={{ x: 40, y: 20 }} onClose={() => setPanels((p) => ({ ...p, graph: false }))}><GraphPanel /></Panel>}
          {panels.formula && <Panel title="GED Formula Sheet" width={360} initial={{ x: 420, y: 20 }} onClose={() => setPanels((p) => ({ ...p, formula: false }))}><FormulaSheet onInsert={insertText} /></Panel>}
        </div>

        {/* Right side buttons */}
        <aside className="z-30 flex w-16 flex-col items-center gap-2 border-l border-border bg-card py-3">
          {([["calc", CalcIcon, "Calculator"], ["graph", LineChart, "Graph"], ["formula", Sigma, "Formulas"]] as const).map(([k, Icon, l]) => (
            <button key={k} onClick={() => setPanels((p) => ({ ...p, [k]: !p[k] }))}
              className={`flex w-12 flex-col items-center gap-0.5 rounded-lg py-2 text-[10px] font-semibold transition ${panels[k] ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
              <Icon className="h-5 w-5" />{l}
            </button>
          ))}
        </aside>
      </div>
    </div>
  );
}

function TextBox({ item, interactive, autoFocus, onChange, onDelete }: {
  item: TextItem; interactive: boolean; autoFocus: boolean;
  onChange: (p: Partial<TextItem>) => void; onDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  useEffect(() => {
    if (ref.current && ref.current.innerText !== item.text) ref.current.innerText = item.text;
  }, [item.text]);
  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);
  return (
    <div className={`group absolute ${interactive ? "" : "pointer-events-none"}`} style={{ left: item.x, top: item.y }}>
      {interactive && (
        <div className="absolute -top-6 left-0 hidden items-center gap-1 group-hover:flex group-focus-within:flex">
          <span className="cursor-move touch-none rounded bg-primary px-1.5 text-xs text-primary-foreground"
            onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { dx: e.clientX - item.x, dy: e.clientY - item.y }; }}
            onPointerMove={(e) => drag.current && onChange({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy })}
            onPointerUp={() => (drag.current = null)}>⠿ move</span>
          <button className="rounded bg-secondary px-1.5 text-xs" onClick={() => onChange({ size: item.size + 4 })}>A+</button>
          <button className="rounded bg-secondary px-1.5 text-xs" onClick={() => onChange({ size: Math.max(12, item.size - 4) })}>A−</button>
          <button className="rounded bg-destructive px-1.5 text-xs text-destructive-foreground" onClick={onDelete}>✕</button>
        </div>
      )}
      <div
        ref={ref}
        contentEditable={interactive}
        suppressContentEditableWarning
        onBlur={(e) => { const v = e.currentTarget.innerText; if (!v.trim()) onDelete(); else onChange({ text: v }); }}
        className={`min-w-[40px] whitespace-pre rounded px-1 font-board outline-none ${interactive ? "focus:ring-2 focus:ring-ring hover:ring-1 hover:ring-border" : ""} ${item.auto ? "animate-in fade-in zoom-in-95 duration-300" : ""}`}
        style={{ fontSize: item.size, color: item.color, lineHeight: 1.2 }}
      />
    </div>
  );
}
