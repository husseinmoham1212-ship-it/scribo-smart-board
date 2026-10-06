import { createFileRoute } from "@tanstack/react-router";
import { Whiteboard } from "@/components/board/Whiteboard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SOMSTART Maths Test — Interactive Math Whiteboard" },
      { name: "description", content: "SOMSTART mathematics test workspace with a TI-30XS calculator, graphing, formula sheet and handwriting-to-text." },
      { property: "og:title", content: "SOMSTART Maths Test — Interactive Math Whiteboard" },
      { property: "og:description", content: "Practice mathematics with handwriting recognition, graphs, a TI-30XS calculator and a formula sheet." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Whiteboard,
});
