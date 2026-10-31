"use client";

import { useCallback, useMemo } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawProps,
} from "@excalidraw/excalidraw/types";
import type { NormalizedDiagram } from "@/lib/diagram-contract";
import { fromExcalidrawElements, toExcalidrawElements } from "@/lib/diagram-converter";

interface DiagramCanvasProps {
  diagram: NormalizedDiagram;
  onDiagramChange: (diagram: NormalizedDiagram) => void;
  onSelectionChange?: (ids: string[]) => void;
  onApiReady?: (api: ExcalidrawImperativeAPI) => void;
}

export default function DiagramCanvas({
  diagram,
  onDiagramChange,
  onSelectionChange,
  onApiReady,
}: DiagramCanvasProps) {
  const initialData = useMemo(
    () => ({ elements: toExcalidrawElements(diagram) }),
    // The initial scene is loaded once. Subsequent edits flow through the Excalidraw API.
    [],
  );
  const handleChange = useCallback<NonNullable<ExcalidrawProps["onChange"]>>(
    (elements, appState) => {
      onDiagramChange(fromExcalidrawElements(elements, diagram.diagramType));
      onSelectionChange?.(
        Object.entries(appState.selectedElementIds)
          .filter(([, selected]) => selected)
          .map(([id]) => id),
      );
    },
    [diagram.diagramType, onDiagramChange, onSelectionChange],
  );

  return (
    <Excalidraw
      initialData={initialData}
      excalidrawAPI={onApiReady}
      onChange={handleChange}
      theme="light"
      UIOptions={{
        canvasActions: {
          changeViewBackgroundColor: false,
          clearCanvas: true,
          export: { saveFileToDisk: true },
          loadScene: true,
          saveToActiveFile: false,
          toggleTheme: false,
        },
      }}
    />
  );
}
