import { useCallback, useEffect, useRef, useState } from "react";
import { Calculator as CalcIcon, Check, ChevronLeft, ChevronRight, CircleHelp, Clock3, Eraser, LineChart, Loader2, MousePointer2, Pause, Pen, Pencil, Play, Redo2, Sigma, SlidersHorizontal, Trash2, Type, Undo2, Wand2, X } from "lucide-react";
import { createWorker } from "tesseract.js";
import { Button } from "@/components/ui/button";
import { Panel } from "./Panel";
import { Calculator } from "./Calculator";
import { GraphPanel } from "./GraphPanel";
import { FormulaSheet } from "./FormulaSheet";

type Pt = { x: number; y: number };
type Stroke = { id: number; pts: Pt[]; color: string; size: number; erase: boolean };
type TextItem = { id: number; x: number; y: number; text: string; size: number; color: string; auto?: boolean };
type RecognitionDraft = { id: number; strokeIds: number[]; image: string; x: number; y: number; text: string; confidence: number; size: number; color: string; editing: boolean };
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
  const [drafts, setDrafts] = useState<RecognitionDraft[]>([]);
  const [tool, setTool] = useState<Tool>("pen");
  const [ink, setInk] = useState("#111827");
  const [size, setSize] = useState(3);
  const [bg, setBg] = useState("#ffffff");
  const [busy, setBusy] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [panels, setPanels] = useState({ calc: false, graph: false, formula: false, question: false });
  const [showWritingControls, setShowWritingControls] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [timerRunning, setTimerRunning] = useState(true);
  const [histVersion, setHistVersion] = useState(0);
  const history = useRef<{ s: Stroke[]; t: TextItem[] }[]>([]);
  const future = useRef<{ s: Stroke[]; t: TextItem[] }[]>([]);
  const drawing = useRef<Stroke | null>(null);
  const activePointerId = useRef<number | null>(null);
  const pointerSnapshot = useRef<{ texts: TextItem[]; historyLength: number } | null>(null);
  const focusId = useRef<number | null>(null);
  const worker = useRef<ReturnType<typeof createWorker> | null>(null);
  const dark = bg === "#1f3a2e" || bg === "#1e2430";

  useEffect(() => () => {
    const currentWorker = worker.current;
    worker.current = null;
    if (currentWorker) {
      void currentWorker.then((tesseract) => tesseract.terminate()).catch((error: unknown) => {
        console.error("Couldn't stop the handwriting recognition worker", error);
      });
    }
  }, []);

  useEffect(() => setInk(dark ? "#ffffff" : "#111827"), [dark]);
  useEffect(() => {
    if (!timerRunning) return;
    const interval = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [timerRunning]);

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
      if (s.pts.length === 1) ctx.lineTo(s.pts[0]!.x + 0.1, s.pts[0]!.y);
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

  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;
  const textsRef = useRef(texts);
  textsRef.current = texts;

  const pushHistory = useCallback(() => {
    history.current.push({ s: strokesRef.current, t: textsRef.current });
    if (history.current.length > 100) history.current.shift();
    future.current = [];
    setHistVersion((v) => v + 1);
  }, []);

  const undo = useCallback(() => {
    const prev = history.current.pop();
    if (!prev) return;
    future.current.push({ s: strokesRef.current, t: textsRef.current });
    setStrokes(prev.s);
    setTexts(prev.t);
    setHistVersion((v) => v + 1);
  }, []);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    history.current.push({ s: strokesRef.current, t: textsRef.current });
    setStrokes(next.s);
    setTexts(next.t);
    setHistVersion((v) => v + 1);
  }, []);

  const convert = useCallback(async () => {
    const pendingIds = new Set(drafts.flatMap((draft) => draft.strokeIds));
    const group = strokesRef.current.filter((stroke) => !stroke.erase && !pendingIds.has(stroke.id));
    if (!group.length) return;
    const strokeIds = group.map((stroke) => stroke.id);
    const xs = group.flatMap((stroke) => stroke.pts.map((point) => point.x));
    const ys = group.flatMap((stroke) => stroke.pts.map((point) => point.y));
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const padding = Math.max(20, ...group.map((stroke) => stroke.size * 3));
    const originX = minX - padding;
    const originY = minY - padding;
    const width = maxX - minX + padding * 2;
    const height = maxY - minY + padding * 2;
    const scale = Math.max(
      0.1,
      Math.min(4, 4096 / width, 4096 / height, Math.sqrt(12_000_000 / (width * height)), 96 / Math.max(height, 1)),
    );
    const image = document.createElement("canvas");
    image.width = Math.max(1, Math.ceil(width * scale));
    image.height = Math.max(1, Math.ceil(height * scale));
    const imageContext = image.getContext("2d");
    if (!imageContext) {
      setMsg("Couldn't prepare the handwriting for recognition.");
      return;
    }
    imageContext.fillStyle = "#fff";
    imageContext.fillRect(0, 0, image.width, image.height);
    imageContext.setTransform(scale, 0, 0, scale, -originX * scale, -originY * scale);
    setBusy((b) => b + 1);
    try {
      const workerPromise = worker.current ?? createWorker("eng");
      worker.current = workerPromise;
      let tesseract: Awaited<typeof workerPromise>;
      try {
        tesseract = await workerPromise;
      } catch (error) {
        if (worker.current === workerPromise) worker.current = null;
        throw error;
      }
      const recognitionStrokes = strokesRef.current.filter((stroke) => strokeIds.includes(stroke.id) || stroke.erase);
      for (const stroke of recognitionStrokes) {
        imageContext.globalCompositeOperation = stroke.erase ? "destination-out" : "source-over";
        imageContext.strokeStyle = "#111";
        imageContext.lineWidth = stroke.erase ? stroke.size * 6 : Math.max(3, stroke.size);
        imageContext.lineCap = "round";
        imageContext.lineJoin = "round";
        imageContext.beginPath();
        stroke.pts.forEach((point, index) => {
          if (index === 0) imageContext.moveTo(point.x, point.y);
          else imageContext.lineTo(point.x, point.y);
        });
        if (stroke.pts.length === 1) imageContext.lineTo(stroke.pts[0]!.x + 0.1, stroke.pts[0]!.y);
        imageContext.stroke();
      }
      imageContext.globalCompositeOperation = "source-over";
      const result = await tesseract.recognize(image.toDataURL("image/png"));
      const text = result.data.text.trim();
      if (text) {
        const fontSize = Math.max(16, Math.min(64, (maxY - minY) * 0.75));
        const confidence = Number.isFinite(result.data.confidence) ? result.data.confidence : 0;
        setDrafts((current) => [...current, {
          id: uid++,
          strokeIds,
          image: image.toDataURL("image/png"),
          x: minX,
          y: minY + (maxY - minY) / 2 - fontSize * 0.7,
          text,
          confidence,
          size: fontSize,
          color: group[0]!.color,
          editing: false,
        }]);
        if (confidence < 65) setMsg("Low recognition confidence. Check the editable draft against your handwriting.");
      } else setMsg("No text recognized. Your handwriting was kept.");
    } catch (error) {
      console.error("Handwriting recognition failed", error);
      setMsg("Couldn't read that handwriting. Your drawing was kept.");
    }
    finally { setBusy((b) => b - 1); }
  }, [drafts, pushHistory]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>): Pt => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const erasedThisStroke = useRef(false);

  const eraseTextAt = (point: Pt) => {
    const radius = Math.max(18, size * 3);
    const remaining = textsRef.current.filter((item) => {
      const width = Math.max(40, item.text.length * item.size * 0.58);
      const height = item.size * 1.4;
      return point.x + radius < item.x || point.x - radius > item.x + width || point.y + radius < item.y || point.y - radius > item.y + height;
    });
    if (remaining.length !== textsRef.current.length) {
      if (!erasedThisStroke.current) {
        erasedThisStroke.current = true;
        pushHistory();
      }
      textsRef.current = remaining;
      setTexts(remaining);
    }
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool === "text") {
      const p = pos(e);
      const id = uid++;
      focusId.current = id;
      setTexts((t) => [...t, { id, x: p.x, y: p.y - 14, text: "", size: 24, color: ink }]);
      setTool("select");
      return;
    }
    if (tool === "select" || activePointerId.current !== null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    activePointerId.current = e.pointerId;
    pointerSnapshot.current = { texts: textsRef.current, historyLength: history.current.length };
    const point = pos(e);
    erasedThisStroke.current = false;
    drawing.current = { id: uid++, pts: [point], color: ink, size, erase: tool === "eraser" };
    if (tool === "eraser") eraseTextAt(point);
    redraw();
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || activePointerId.current !== e.pointerId) return;
    const evs = e.nativeEvent.getCoalescedEvents?.() ?? [];
    if (evs.length) {
      const r = e.currentTarget.getBoundingClientRect();
      evs.forEach((ev) => drawing.current!.pts.push({ x: ev.clientX - r.left, y: ev.clientY - r.top }));
    } else drawing.current.pts.push(pos(e));
    if (tool === "eraser") eraseTextAt(pos(e));
    redraw();
  };
  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointerId.current !== e.pointerId) return;
    const s = drawing.current;
    activePointerId.current = null;
    pointerSnapshot.current = null;
    if (!s) return;
    const finalPoint = pos(e);
    const lastPoint = s.pts.at(-1);
    if (!lastPoint || lastPoint.x !== finalPoint.x || lastPoint.y !== finalPoint.y) s.pts.push(finalPoint);
    drawing.current = null;
    pushHistory();
    setStrokes((ss) => [...ss, s]);
  };
  const onCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointerId.current !== e.pointerId) return;
    activePointerId.current = null;
    drawing.current = null;
    const snapshot = pointerSnapshot.current;
    pointerSnapshot.current = null;
    if (snapshot) {
      textsRef.current = snapshot.texts;
      setTexts(snapshot.texts);
      if (erasedThisStroke.current && history.current.length === snapshot.historyLength + 1) history.current.pop();
    }
    erasedThisStroke.current = false;
    redraw();
  };

  const updateDraft = (id: number, patch: Partial<Pick<RecognitionDraft, "text" | "editing">>) => {
    setDrafts((current) => current.map((draft) => draft.id === id ? { ...draft, ...patch } : draft));
  };

  const acceptDraft = (draft: RecognitionDraft) => {
    const text = draft.text.trim();
    if (!text) {
      setMsg("Enter recognized text before accepting the draft.");
      return;
    }
    pushHistory();
    setStrokes((current) => current.filter((stroke) => !draft.strokeIds.includes(stroke.id)));
    setTexts((current) => [...current, {
      id: uid++,
      x: draft.x,
      y: draft.y,
      text,
      size: draft.size,
      color: draft.color,
      auto: true,
    }]);
    setDrafts((current) => current.filter((item) => item.id !== draft.id));
    setMsg(null);
  };

  const insertText = (t: string) => {
    const w = wrap.current!;
    setTexts((arr) => [...arr, { id: uid++, x: w.clientWidth / 2 - 150, y: 80 + (arr.length % 10) * 40, text: t, size: 24, color: ink }]);
  };

  const addTextBox = () => {
    const w = wrap.current;
    if (!w) return;
    const id = uid++;
    focusId.current = id;
    setTexts((items) => [...items, { id, x: Math.max(24, w.clientWidth / 2 - 140), y: Math.max(48, w.clientHeight / 3), text: "Type your work here", size: 24, color: ink }]);
    setTool("select");
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

  const timeLabel = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex min-h-16 flex-wrap items-center gap-3 border-b border-exam-header-border bg-exam-header px-4 py-2 text-exam-header-foreground">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-exam-mark font-display text-lg font-black text-exam-mark-foreground">S</div>
          <h1 className="font-display text-xl font-black sm:text-2xl">SOMSTART MATHS TEST</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-xs font-bold uppercase sm:inline">Mathematical Reasoning Practice</span>
          <div className="flex h-9 items-center gap-2 rounded-md border border-exam-header-border bg-exam-header-muted px-3 font-mono text-sm font-bold">
            <Clock3 className="h-4 w-4" /> {timeLabel}
            <Button type="button" variant="ghost" size="icon" onClick={() => setTimerRunning((value) => !value)} className="h-7 w-7 text-exam-header-foreground hover:bg-exam-header-hover hover:text-exam-header-foreground" aria-label={timerRunning ? "Pause timer" : "Resume timer"} title={timerRunning ? "Pause timer" : "Resume timer"}>
              {timerRunning ? <Pause /> : <Play />}
            </Button>
          </div>
        </div>
      </header>

      <div className="flex min-h-12 flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-2">
        <div className="mr-2 flex items-center gap-3">
          <span className="font-display text-sm font-bold">Question 1 of 1</span>
          <span className="h-2 w-24 overflow-hidden rounded-full bg-muted"><span className="block h-full w-full bg-primary" /></span>
        </div>
        <div className="flex shrink-0 items-center gap-1" role="group" aria-label="Board background colours">
          {BG.map((b) => (
            <Button type="button" variant="outline" size="icon" key={b.n} title={`Background ${b.n}`} onClick={() => setBg(b.v)} aria-label={`Background ${b.n}`} aria-pressed={bg === b.v}
              className={`h-6 w-6 rounded-md p-0 ${bg === b.v ? "ring-2 ring-primary ring-offset-2 ring-offset-card" : ""}`}
              style={b.v === "grid" ? { backgroundColor: "#fff", backgroundImage: "linear-gradient(#cbd5e1 1px,transparent 1px),linear-gradient(90deg,#cbd5e1 1px,transparent 1px)", backgroundSize: "6px 6px" } : { background: b.v }} />
          ))}
          <input type="color" value={bg.startsWith("#") ? bg : "#ffffff"} onChange={(e) => setBg(e.target.value)} className="h-6 w-7 cursor-pointer rounded border border-border bg-transparent" aria-label="Custom background" />
        </div>
        <Button type="button" variant={showWritingControls ? "secondary" : "outline"} size="sm" onClick={() => setShowWritingControls((value) => !value)} aria-expanded={showWritingControls} aria-controls="writing-controls" title={showWritingControls ? "Hide writing controls" : "Show writing controls"}>
          <SlidersHorizontal /> {showWritingControls ? "Hide tools" : "Show tools"}
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled><ChevronLeft /> Previous</Button>
          <Button type="button" size="sm">Review answer <ChevronRight /></Button>
        </div>
      </div>

      {showWritingControls && <div id="writing-controls" className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-2">
        <div className="flex items-center gap-1">
          {INK.map((c) => (
            <Button type="button" variant="outline" size="icon" key={c} onClick={() => { setInk(c); if (tool !== "pen" && tool !== "text") setTool("pen"); }} aria-label={`Ink ${c}`} title={`Ink ${c}`} aria-pressed={ink === c}
              className={`h-6 w-6 rounded-full p-0 ${ink === c ? "ring-2 ring-primary ring-offset-2 ring-offset-card" : ""}`} style={{ background: c }} />
          ))}
        </div>
        <input type="range" min={1} max={12} value={size} onChange={(e) => setSize(+e.target.value)} className="w-24 accent-[var(--primary)]" aria-label={tool === "eraser" ? "Rubber size" : "Pen size"} />
        <Button type="button" variant={tool === "eraser" ? "default" : "outline"} size="sm" onClick={() => setTool("eraser")} aria-pressed={tool === "eraser"}>
          <Eraser /> Rubber
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={addTextBox}><Type /> Add text box</Button>
        <div className="ml-auto flex items-center gap-2">
          {busy > 0 && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Recognizing…</span>}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy > 0 || !strokes.some((stroke) => !stroke.erase && !drafts.some((draft) => draft.strokeIds.includes(stroke.id)))}
            onClick={() => void convert()}
          >
            <Wand2 className="h-3.5 w-3.5" /> Recognize handwriting
          </Button>
        </div>
      </div>}


      <div className="relative flex flex-1 overflow-hidden">
        {/* Left tools */}
        <aside className="z-30 flex w-14 flex-col items-center gap-1 border-r border-border bg-card py-3">
          {toolBtn("pen", Pen, "Pen")}
          {toolBtn("eraser", Eraser, "Rubber — erase wrong areas")}
          {toolBtn("text", Type, "Text box")}
          {toolBtn("select", MousePointer2, "Move / edit text")}
          <div className="my-2 h-px w-8 bg-border" />
          <button onClick={undo} disabled={histVersion < 0 || !history.current.length} title="Undo — bring back what you deleted" aria-label="Undo — bring back what you deleted" className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent"><Undo2 className="h-5 w-5" /></button>
          <button onClick={redo} disabled={histVersion < 0 || !future.current.length} title="Redo" aria-label="Redo" className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent"><Redo2 className="h-5 w-5" /></button>
          <button onClick={() => { pushHistory(); setStrokes([]); setTexts([]); }} title="Clear board" aria-label="Clear board" className="flex h-10 w-10 items-center justify-center rounded-lg text-destructive hover:bg-accent"><Trash2 className="h-5 w-5" /></button>
        </aside>

        {/* Working area */}
        <div ref={wrap} className="relative flex-1 overflow-hidden" style={bgStyle}>
          <canvas
            ref={canvas}
            className="absolute inset-0 h-full w-full touch-none"
            style={{ cursor: tool === "text" ? "text" : tool === "select" ? "default" : tool === "eraser" ? "cell" : "crosshair" }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel}
          />
          {texts.map((t) => (
            <TextBox key={t.id} item={t} interactive={tool === "select"} autoFocus={focusId.current === t.id}
              onChange={(patch) => { if (patch.text !== undefined) pushHistory(); setTexts((arr) => arr.map((x) => (x.id === t.id ? { ...x, ...patch } : x))); }}
              onDelete={() => { pushHistory(); setTexts((arr) => arr.filter((x) => x.id !== t.id)); }} />
          ))}
          {drafts.length > 0 && (
            <div className="absolute bottom-4 left-4 z-40 flex max-h-[45%] w-[min(28rem,calc(100%-2rem))] flex-col gap-3 overflow-y-auto">
              {drafts.map((draft) => (
                <section key={draft.id} className="rounded-lg border border-border bg-card p-3 text-card-foreground shadow-lg">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold">Recognition draft</h2>
                    <span className={`text-xs ${draft.confidence < 65 ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
                      {draft.confidence < 65 ? "Low confidence — verify carefully" : `OCR confidence: ${Math.round(draft.confidence)}%`}
                    </span>
                  </div>
                  <div className="flex gap-3">
                    <img src={draft.image} alt="Original handwriting for comparison" className="h-16 max-w-28 rounded border border-border bg-white object-contain" />
                    <textarea
                      value={draft.text}
                      readOnly={!draft.editing}
                      onChange={(event) => updateDraft(draft.id, { text: event.target.value })}
                      aria-label="Editable recognition draft"
                      className="min-h-16 min-w-0 flex-1 resize-y rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring read-only:cursor-default"
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap justify-end gap-2">
                    {draft.editing ? (
                      <Button type="button" size="sm" variant="outline" onClick={() => updateDraft(draft.id, { editing: false })}>
                        <Check /> Done editing
                      </Button>
                    ) : (
                      <Button type="button" size="sm" variant="outline" onClick={() => updateDraft(draft.id, { editing: true })}>
                        <Pencil /> Edit
                      </Button>
                    )}
                    <Button type="button" size="sm" onClick={() => acceptDraft(draft)}>
                      <Check /> Accept and replace handwriting
                    </Button>
                    <Button type="button" size="sm" variant="secondary" onClick={() => setDrafts((current) => current.filter((item) => item.id !== draft.id))}>
                      <X /> Reject
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Handwriting remains on the board unless you accept this result.</p>
                </section>
              ))}
            </div>
          )}
          {msg && (
            <button onClick={() => setMsg(null)} className="absolute bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-sm text-background shadow-lg">{msg}</button>
          )}
          {panels.calc && <Panel title="TI-30XS MultiView" width={280} initial={{ x: Math.max(16, (wrap.current?.clientWidth ?? 1000) - 300), y: 16 }} onClose={() => setPanels((p) => ({ ...p, calc: false }))}><Calculator /></Panel>}
          {panels.graph && <Panel title="Graph" width={370} initial={{ x: 40, y: 20 }} onClose={() => setPanels((p) => ({ ...p, graph: false }))}><GraphPanel /></Panel>}
          {panels.formula && <Panel title="Math Formula Sheet" width={360} initial={{ x: 420, y: 20 }} onClose={() => setPanels((p) => ({ ...p, formula: false }))}><FormulaSheet onInsert={insertText} /></Panel>}
          {panels.question && (
            <Panel title="Question 1" width={380} initial={{ x: 60, y: 16 }} onClose={() => setPanels((p) => ({ ...p, question: false }))}>
              <div className="flex flex-col gap-2">
                <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={4}
                  placeholder="Enter the mathematics question here…"
                  className="min-h-[88px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus:ring-2 focus:ring-ring" />
                <div className="flex flex-wrap gap-1">
                  {SYMBOLS.map((s) => (
                    <button key={s} onClick={() => setQuestion((q) => q + s)} className="h-8 w-8 rounded border border-border bg-background font-mono text-sm hover:bg-accent">{s}</button>
                  ))}
                </div>
              </div>
            </Panel>
          )}
        </div>

        {/* Right side buttons */}
        <aside className="z-30 flex w-16 flex-col items-center gap-2 border-l border-border bg-card py-3">
          {([["calc", CalcIcon, "Calculator"], ["graph", LineChart, "Graph"], ["formula", Sigma, "Formulas"], ["question", CircleHelp, "Question"]] as const).map(([k, Icon, l]) => (
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
