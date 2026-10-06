import { createFileRoute } from "@tanstack/react-router";
import { Whiteboard } from "@/components/board/Whiteboard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GED Math Board — Interactive Teaching Whiteboard" },
      { name: "description", content: "Whiteboard for GED math with a TI-30XS calculator, graphing, formula sheet and handwriting-to-text." },
      { property: "og:title", content: "GED Math Board — Interactive Teaching Whiteboard" },
      { property: "og:description", content: "Teach GED math with handwriting recognition, graphs, a TI-30XS calculator and the formula sheet." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Whiteboard,
});
