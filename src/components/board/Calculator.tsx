import { useState } from "react";
import { create, all } from "mathjs";

const math = create(all, {});

type Line = { expr: string; result: string; frac: boolean };

function toDisplay(v: unknown, frac: boolean): string {
  if (typeof v === "number") {
    if (frac && !Number.isInteger(v)) {
      try {
        const f = math.fraction(v) as unknown as { s: number; n: number; d: number };
        if (Number(f.d) <= 10000) return `${Number(f.s) < 0 ? "-" : ""}${f.n}/${f.d}`;
      } catch { /* ignore */ }
    }
    return String(math.format(v, { precision: 10 }));
  }
  return String(math.format(v as never, { precision: 10 }));
}

export function Calculator() {
  const [expr, setExpr] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [second, setSecond] = useState(false);
  const [deg, setDeg] = useState(true);
  const [ans, setAns] = useState(0);
  const [raw, setRaw] = useState<unknown[]>([]);

  const ins = (s: string) => {
    setExpr((e) => e + s);
    setSecond(false);
  };

  const evaluate = () => {
    if (!expr.trim()) return;
    let src = expr
      .replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/π/g, "pi")
      .replace(/√\(/g, "sqrt(").replace(/\(-\)/g, "-").replace(/ans/gi, `(${ans})`)
      .replace(/(\d+(?:\.\d+)?)%/g, "($1/100)");
    const scope = deg
      ? {
          sin: (x: number) => Math.sin((x * Math.PI) / 180),
          cos: (x: number) => Math.cos((x * Math.PI) / 180),
          tan: (x: number) => Math.tan((x * Math.PI) / 180),
          asin: (x: number) => (Math.asin(x) * 180) / Math.PI,
          acos: (x: number) => (Math.acos(x) * 180) / Math.PI,
          atan: (x: number) => (Math.atan(x) * 180) / Math.PI,
        }
      : {};
    src = src.replace(/ln\(/g, "log(").replace(/logt\(/g, "log10(");
    try {
      const v = math.evaluate(src.replace(/log\(/g, "LN(").replace(/LN\(/g, "log("), scope);
      const r = toDisplay(v, false);
      setLines((l) => [...l.slice(-3), { expr, result: r, frac: false }]);
      setRaw((x) => [...x.slice(-3), v]);
      if (typeof v === "number") setAns(v);
      setExpr("");
    } catch {
      setLines((l) => [...l.slice(-3), { expr, result: "SYNTAX ERROR", frac: false }]);
      setRaw((x) => [...x.slice(-3), null]);
    }
  };

  const toggleFrac = () => {
    setLines((l) =>
      l.map((ln, i) => (i === l.length - 1 && raw[i] != null ? { ...ln, frac: !ln.frac, result: toDisplay(raw[i], !ln.frac) } : ln)),
    );
  };

  type K = { l: string; s?: string; a: () => void; v?: "num" | "op" | "fn" | "2nd" | "enter" };
  const K = (l: string, a: () => void, v: K["v"] = "fn", s?: string): K => ({ l, a, v, s });

  const keys: K[] = [
    K("2nd", () => setSecond((s) => !s), "2nd"),
    K(deg ? "DEG" : "RAD", () => setDeg((d) => !d), "fn", "mode"),
    K("◄►", toggleFrac, "fn", "f◄►d"),
    K("del", () => setExpr((e) => e.slice(0, -1)), "fn"),
    K("clear", () => { setExpr(""); if (second) setLines([]); setSecond(false); }, "fn", "clr all"),
    K(second ? "10ˣ" : "log", () => ins(second ? "10^(" : "logt("), "fn"),
    K(second ? "eˣ" : "ln", () => ins(second ? "e^(" : "ln("), "fn"),
    K("n/d", () => ins("/"), "fn"),
    K(second ? "sin⁻¹" : "sin", () => ins(second ? "asin(" : "sin("), "fn"),
    K(second ? "cos⁻¹" : "cos", () => ins(second ? "acos(" : "cos("), "fn"),
    K(second ? "tan⁻¹" : "tan", () => ins(second ? "atan(" : "tan("), "fn"),
    K("π", () => ins("π"), "fn"),
    K(second ? "√" : "x²", () => ins(second ? "√(" : "^2"), "fn", "√"),
    K("^", () => ins("^"), "fn"),
    K("x⁻¹", () => ins("^(-1)"), "fn"),
    K("(", () => ins("("), "fn"),
    K(")", () => ins(")"), "fn"),
    K("÷", () => ins("÷"), "op"),
    K("7", () => ins("7"), "num"), K("8", () => ins("8"), "num"), K("9", () => ins("9"), "num"),
    K("×", () => ins("×"), "op"),
    K("4", () => ins("4"), "num"), K("5", () => ins("5"), "num"), K("6", () => ins("6"), "num"),
    K("−", () => ins("−"), "op"),
    K("1", () => ins("1"), "num"), K("2", () => ins("2"), "num"), K("3", () => ins("3"), "num"),
    K("+", () => ins("+"), "op"),
    K("0", () => ins("0"), "num"), K(".", () => ins("."), "num"),
    K(second ? "ans" : "(−)", () => ins(second ? "ans" : "(-)"), "num", "ans"),
    K(second ? "%" : "enter", second ? () => ins("%") : evaluate, "enter", "%"),
  ];

  const style: Record<string, string> = {
    num: "bg-calc-num text-calc-num-foreground",
    op: "bg-calc-op text-calc-op-foreground",
    fn: "bg-calc-fn text-calc-fn-foreground",
    "2nd": second ? "bg-calc-second text-calc-op-foreground ring-2 ring-calc-screen" : "bg-calc-second text-calc-op-foreground",
    enter: "bg-calc-op text-calc-op-foreground",
  };

  return (
    <div className="rounded-2xl bg-calc-body p-3">
      <div className="mb-1 flex justify-between px-1 font-display text-[10px] font-bold tracking-widest text-calc-fn-foreground">
        <span>TI-30XS</span><span>MultiView</span>
      </div>
      <div className="mb-3 h-28 overflow-hidden rounded-md bg-calc-screen p-2 font-mono text-xs text-calc-screen-foreground">
        <div className="flex justify-between text-[9px] opacity-70"><span>{second ? "2ND" : ""}</span><span>{deg ? "DEG" : "RAD"}</span></div>
        {lines.slice(-2).map((ln, i) => (
          <div key={i}>
            <div className="truncate">{ln.expr}</div>
            <div className="text-right font-semibold">{ln.result}</div>
          </div>
        ))}
        <div className="truncate">{expr}<span className="animate-pulse">▌</span></div>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {keys.map((k, i) => (
          <button
            key={i}
            onClick={k.a}
            className={`relative h-8 rounded-md text-xs font-semibold shadow-sm transition active:translate-y-px ${style[k.v ?? "fn"]}`}
          >
            {k.l}
          </button>
        ))}
      </div>
    </div>
  );
}
