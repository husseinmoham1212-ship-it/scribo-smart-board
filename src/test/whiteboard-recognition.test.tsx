import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createWorkerMock, recognizeMock, terminateMock } = vi.hoisted(() => ({
  createWorkerMock: vi.fn(),
  recognizeMock: vi.fn(),
  terminateMock: vi.fn(),
}));

vi.mock("tesseract.js", () => ({ createWorker: createWorkerMock }));

import { Whiteboard } from "@/components/board/Whiteboard";

function makeCanvasContext() {
  return {
    globalCompositeOperation: "source-over",
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  };
}

function drawStroke(pointerId = 1) {
  const canvas = document.querySelector("canvas");
  if (!canvas) throw new Error("Whiteboard canvas was not rendered");
  fireEvent.pointerDown(canvas, { pointerId, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(canvas, { pointerId, clientX: 160, clientY: 120 });
  fireEvent.pointerUp(canvas, { pointerId, clientX: 170, clientY: 125 });
  return canvas;
}

function showRecognitionControls() {
  fireEvent.click(screen.getByRole("button", { name: "Show tools" }));
}

describe("whiteboard handwriting recognition review", () => {
  let canvasContext: ReturnType<typeof makeCanvasContext>;

  beforeEach(() => {
    canvasContext = makeCanvasContext();
    createWorkerMock.mockReset();
    recognizeMock.mockReset();
    terminateMock.mockReset();
    createWorkerMock.mockResolvedValue({
      recognize: recognizeMock,
      terminate: terminateMock,
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () => canvasContext as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,fixture");
    vi.spyOn(HTMLCanvasElement.prototype, "setPointerCapture").mockImplementation(() => {});
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
      toJSON: () => ({}),
    } as DOMRect);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("does not recognize automatically and keeps the original strokes while showing an editable draft", async () => {
    recognizeMock.mockResolvedValue({ data: { text: "2x + 5 = 15", confidence: 92 } });
    render(<Whiteboard />);
    const canvas = drawStroke();

    expect(createWorkerMock).not.toHaveBeenCalled();
    showRecognitionControls();
    fireEvent.click(screen.getByRole("button", { name: "Recognize handwriting" }));

    const draft = await screen.findByRole("region", { name: "Recognition draft" });
    expect(within(draft).getByRole("textbox", { name: "Editable recognition draft" })).toHaveValue("2x + 5 = 15");
    expect(within(draft).getByRole("img", { name: "Original handwriting for comparison" })).toHaveAttribute("src", "data:image/png;base64,fixture");
    expect(canvasContext.stroke).toHaveBeenCalled();
    expect(within(draft).getByText(/Handwriting remains on the board/)).toBeInTheDocument();
    expect(within(draft).getByRole("button", { name: "Accept and replace handwriting" })).toBeInTheDocument();
    expect(within(draft).getByRole("button", { name: "Reject" })).toBeInTheDocument();
  });

  it("replaces handwriting only after accepting the edited draft", async () => {
    recognizeMock.mockResolvedValue({ data: { text: "2x + 5 = 16", confidence: 92 } });
    render(<Whiteboard />);
    drawStroke();
    showRecognitionControls();
    fireEvent.click(screen.getByRole("button", { name: "Recognize handwriting" }));

    const draft = await screen.findByRole("region", { name: "Recognition draft" });
    fireEvent.click(within(draft).getByRole("button", { name: "Edit" }));
    const editor = within(draft).getByRole("textbox", { name: "Editable recognition draft" });
    expect(editor).not.toHaveAttribute("readonly");
    fireEvent.change(editor, { target: { value: "2x + 5 = 15" } });
    fireEvent.click(within(draft).getByRole("button", { name: "Accept and replace handwriting" }));

    await waitFor(() => expect(screen.queryByRole("region", { name: "Recognition draft" })).not.toBeInTheDocument());
    expect(document.querySelector('[contenteditable="false"]')).toHaveTextContent("2x + 5 = 15");
  });

  it("rejects a draft without accepting it, preserving the strokes for another attempt", async () => {
    recognizeMock.mockResolvedValue({ data: { text: "unrelated result", confidence: 92 } });
    render(<Whiteboard />);
    drawStroke();
    showRecognitionControls();
    fireEvent.click(screen.getByRole("button", { name: "Recognize handwriting" }));

    const draft = await screen.findByRole("region", { name: "Recognition draft" });
    fireEvent.click(within(draft).getByRole("button", { name: "Reject" }));

    await waitFor(() => expect(screen.queryByRole("region", { name: "Recognition draft" })).not.toBeInTheDocument());
    expect(document.querySelector('[contenteditable="false"]')).toBeNull();
    expect(screen.getByRole("button", { name: "Recognize handwriting" })).toBeEnabled();
  });

  it("marks low-confidence recognition for careful review", async () => {
    recognizeMock.mockResolvedValue({ data: { text: "x + y = 1O", confidence: 24 } });
    render(<Whiteboard />);
    drawStroke();
    showRecognitionControls();
    fireEvent.click(screen.getByRole("button", { name: "Recognize handwriting" }));

    const draft = await screen.findByRole("region", { name: "Recognition draft" });
    expect(within(draft).getByText("Low confidence — verify carefully")).toBeInTheDocument();
    expect(within(draft).getByRole("textbox", { name: "Editable recognition draft" })).toHaveValue("x + y = 1O");
    expect(document.querySelector('[contenteditable="false"]')).toBeNull();
  });

  it("keeps strokes when OCR returns no text or fails", async () => {
    recognizeMock.mockResolvedValueOnce({ data: { text: "  ", confidence: 0 } });
    render(<Whiteboard />);
    drawStroke();
    showRecognitionControls();
    fireEvent.click(screen.getByRole("button", { name: "Recognize handwriting" }));

    expect(await screen.findByText("No text recognized. Your handwriting was kept.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Recognition draft" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recognize handwriting" })).toBeEnabled();
  });

  it("does not commit or recognize a pointer-cancelled stroke", () => {
    render(<Whiteboard />);
    const canvas = document.querySelector("canvas");
    if (!canvas) throw new Error("Whiteboard canvas was not rendered");

    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 150, clientY: 100 });
    fireEvent.pointerCancel(canvas, { pointerId: 1, clientX: 150, clientY: 100 });
    showRecognitionControls();

    expect(createWorkerMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Recognize handwriting" })).toBeDisabled();
  });
});
