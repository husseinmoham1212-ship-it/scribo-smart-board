import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SYSTEM =
  "You transcribe handwritten math and text from a whiteboard. Output ONLY the transcription as a single line of plain text using Unicode math symbols (² ³ √ π ÷ × ≤ ≥ ≠ ° ½ etc). Write fractions as a/b. No explanations, no quotes, no LaTeX, no markdown. If nothing is legible, output nothing.";

export const recognizeHandwriting = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ image: z.string().startsWith("data:image/").max(4_000_000) }).parse(d))
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { text: "", error: "missing key" as string | null };
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "fetch",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        reasoning: { effort: "low" },
        store: false,
        stream: true,
        instructions: SYSTEM,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: "Transcribe this handwriting." },
              { type: "input_image", image_url: data.image },
            ],
          },
        ],
      }),
    });
    if (res.status === 429) return { text: "", error: "Too many requests, slow down a bit." };
    if (res.status === 402) return { text: "", error: "AI credits used up." };
    if (!res.ok || !res.body) return { text: "", error: "Recognition failed" };

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const ev = JSON.parse(payload) as { type?: string; delta?: string };
          if (ev.type === "response.output_text.delta" && ev.delta) text += ev.delta;
        } catch { /* partial */ }
      }
    }
    text = text.replace(/^["'`]+|["'`]+$/g, "").trim();
    return { text, error: null as string | null };
  });
