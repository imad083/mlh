import {
  convertToExcalidrawElements,
} from "@excalidraw/excalidraw";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import type {
  DiagramConnection,
  DiagramElement,
  DiagramPayload,
  DiagramType,
  NormalizedDiagram,
  ShapeType,
} from "@/lib/diagram-contract";
import type {
  ExcalidrawElement,
  ExcalidrawGenericElement,
  ExcalidrawLinearElement,
  ExcalidrawTextElement,
} from "@excalidraw/excalidraw/element/types";

const DEFAULT_BACKGROUND = "#ffffff";
const DEFAULT_STROKE = "#334155";

type ShapeElement = Extract<ExcalidrawGenericElement, { type: ShapeType }>;

function isGenericShape(element: ExcalidrawElement): element is ShapeElement {
  return (
    (element.type === "rectangle" || element.type === "ellipse" || element.type === "diamond") &&
    !element.isDeleted
  );
}

function isText(element: ExcalidrawElement): element is ExcalidrawTextElement {
  return element.type === "text" && !element.isDeleted;
}

function isArrow(element: ExcalidrawElement): element is ExcalidrawLinearElement {
  return element.type === "arrow" && !element.isDeleted;
}

function getShapeType(type: ShapeElement["type"]): ShapeType {
  return type;
}

function shapeSkeleton(element: DiagramElement): ExcalidrawElementSkeleton {
  if (element.type === "text") {
    return {
      type: "text",
      id: element.id,
      text: element.text,
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      strokeColor: element.style?.strokeColor ?? DEFAULT_STROKE,
      backgroundColor: "transparent",
      textAlign: "left",
      verticalAlign: "top",
      fontSize: 20,
      fontFamily: 5,
    };
  }

  return {
    type: element.type,
    id: element.id,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    backgroundColor: element.style?.backgroundColor ?? DEFAULT_BACKGROUND,
    strokeColor: element.style?.strokeColor ?? DEFAULT_STROKE,
    label: element.text ? { text: element.text } : undefined,
  };
}

function connectionSkeleton(
  connection: DiagramConnection,
  elements: DiagramElement[],
): ExcalidrawElementSkeleton | null {
  const from = elements.find((element) => element.id === connection.from);
  const to = elements.find((element) => element.id === connection.to);
  if (!from || !to) {
    return null;
  }

  const startX = from.x + from.width / 2;
  const startY = from.y + from.height / 2;
  const endX = to.x + to.width / 2;
  const endY = to.y + to.height / 2;

  return {
    type: "arrow",
    id: connection.id,
    x: startX,
    y: startY,
    points: [
      [0, 0],
      [endX - startX, endY - startY],
    ],
    start: { id: from.id },
    end: { id: to.id },
    endArrowhead: "arrow",
    label: connection.label ? { text: connection.label } : undefined,
  };
}

export function toExcalidrawElements(diagram: DiagramPayload) {
  const shapes = diagram.elements.map(shapeSkeleton);
  const connections = diagram.connections
    .map((connection) => connectionSkeleton(connection, diagram.elements))
    .filter((element): element is ExcalidrawElementSkeleton => element !== null);

  return convertToExcalidrawElements([...shapes, ...connections], { regenerateIds: false });
}

export function fromExcalidrawElements(
  elements: readonly ExcalidrawElement[],
  diagramType: DiagramType,
): NormalizedDiagram {
  const visible = elements.filter((element) => !element.isDeleted);
  const textByContainer = new Map<string, string>();
  const textElements: DiagramElement[] = [];

  for (const element of visible) {
    if (!isText(element)) {
      continue;
    }
    if (element.containerId) {
      textByContainer.set(element.containerId, element.text);
    } else {
      textElements.push({
        id: element.id,
        type: "text",
        text: element.text,
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
        style: { strokeColor: element.strokeColor },
      });
    }
  }

  const shapes: DiagramElement[] = visible
    .filter(isGenericShape)
    .map((element) => ({
      id: element.id,
      type: getShapeType(element.type),
      text: textByContainer.get(element.id) ?? "",
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      style: {
        backgroundColor: element.backgroundColor,
        strokeColor: element.strokeColor,
      },
    }));

  const shapeIds = new Set(shapes.map((shape) => shape.id));
  const connections: DiagramConnection[] = visible
    .filter(isArrow)
    .flatMap((element) => {
      const start = element.startBinding?.elementId;
      const end = element.endBinding?.elementId;
      if (!start || !end || !shapeIds.has(start) || !shapeIds.has(end)) {
        return [];
      }

      const label = visible.find(
        (candidate): candidate is ExcalidrawTextElement =>
          candidate.type === "text" && candidate.containerId === element.id,
      )?.text;
      return [{ id: element.id, from: start, to: end, ...(label ? { label } : {}) }];
    });

  return {
    diagramType,
    elements: [...shapes, ...textElements],
    connections,
  };
}
