const SECTIONS: { t: string; f: [string, string][] }[] = [
  { t: "Area", f: [["Square", "A = s²"], ["Rectangle", "A = l × w"], ["Parallelogram", "A = b × h"], ["Triangle", "A = ½ × b × h"], ["Trapezoid", "A = ½ × h(b₁ + b₂)"], ["Circle", "A = πr²"]] },
  { t: "Perimeter", f: [["Square", "P = 4s"], ["Rectangle", "P = 2l + 2w"], ["Triangle", "P = s₁ + s₂ + s₃"], ["Circumference", "C = 2πr  or  C = πd"]] },
  { t: "Surface Area & Volume", f: [["Rectangular prism", "SA = 2lw + 2lh + 2wh,  V = lwh"], ["Right prism", "SA = ph + 2B,  V = Bh"], ["Cylinder", "SA = 2πrh + 2πr²,  V = πr²h"], ["Pyramid", "SA = ½ps + B,  V = ⅓Bh"], ["Cone", "SA = πrs + πr²,  V = ⅓πr²h"], ["Sphere", "SA = 4πr²,  V = (4/3)πr³"]] },
  { t: "Algebra", f: [["Slope", "m = (y₂ − y₁)/(x₂ − x₁)"], ["Slope-intercept", "y = mx + b"], ["Point-slope", "y − y₁ = m(x − x₁)"], ["Standard form", "ax + by = c"], ["Quadratic standard", "y = ax² + bx + c"], ["Quadratic formula", "x = (−b ± √(b² − 4ac)) / 2a"], ["Pythagorean theorem", "a² + b² = c²"], ["Simple interest", "I = prt"], ["Distance", "d = rt"], ["Total cost", "cost = units × price per unit"]] },
  { t: "Data & Statistics", f: [["Mean", "sum of values ÷ number of values"], ["Median", "middle value when ordered"], ["Mode", "most frequent value"], ["Range", "max − min"], ["Probability", "P = favorable ÷ total outcomes"]] },
];

export function FormulaSheet({ onInsert }: { onInsert: (s: string) => void }) {
  return (
    <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
      <p className="text-xs text-muted-foreground">GED Mathematical Reasoning formula sheet. Click a formula to place it on the board.</p>
      {SECTIONS.map((s) => (
        <div key={s.t}>
          <h4 className="mb-1 font-display text-xs font-bold uppercase tracking-wider text-primary">{s.t}</h4>
          <div className="space-y-1">
            {s.f.map(([n, f]) => (
              <button key={n} onClick={() => onInsert(f)} className="flex w-full items-baseline justify-between gap-2 rounded-md px-2 py-1 text-left hover:bg-accent">
                <span className="text-xs text-muted-foreground">{n}</span>
                <span className="font-mono text-xs">{f}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
