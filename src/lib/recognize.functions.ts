import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const recognizeHandwriting = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ image: z.string().startsWith("data:image/").max(4_000_000) }).parse(d))
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { text: "", error: "missing key" };
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You transcribe handwritten math and text from a whiteboard. Output ONLY the transcription as a single line of plain text using Unicode math symbols (² ³ √ π ÷ × ≤ ≥ ≠ ° ½ etc). Write fractions as a/b. No explanations, no quotes, no LaTeX, no markdown. If nothing is legible, output an empty string.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Transcribe this handwriting." },
              { type: "image_url", image_url: { url: data.image } },
            ],
          },
        ],
      }),
    });
    if (res.status === 429) return { text: "", error: "Too many requests, slow down a bit." };
    if (res.status === 402) return { text: "", error: "AI credits used up." };
    if (!res.ok) return { text: "", error: "Recognition failed" };
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = (json.choices?.[0]?.message?.content ?? "").replace(/^["'`]+|["'`]+$/g, "").trim();
    return { text, error: null as string | null };
  });
