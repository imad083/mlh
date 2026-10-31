import {
    convertToExcalidrawElements,
} from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import type {
    DiagramConnection,
    DiagramElement,
    NormalizedDiagram,
} from "@/shared/diagram";

const shapeTypes = new Set(["rectangle", "ellipse", "diamond", "text"]);

function isDiagramShape(
    element: ExcalidrawElement,
): element is ExcalidrawElement & { type: DiagramElement["type"] } {
    return shapeTypes.has(element.type);
}

export function toExcalidrawElements(
    diagram: Pick<NormalizedDiagram, "elements" | "connections">,
): ExcalidrawElement[] {
    const shapeById = new Map(diagram.elements.map((element) => [element.id, element]));
    const skeleton: ExcalidrawElementSkeleton[] = diagram.elements.map((element) => {
        const label = {
            text: element.text,
            strokeColor: element.style?.strokeColor ?? "#1e293b",
            backgroundColor: element.style?.backgroundColor ?? "transparent",
            fontSize: 20,
        };

        if (element.type === "text") {
            return {
                type: "text",
                id: element.id,
                x: element.x,
                y: element.y,
                width: element.width,
                height: element.height,
                text: element.text,
                strokeColor: label.strokeColor,
                backgroundColor: label.backgroundColor,
                fontSize: label.fontSize,
            };
        }

        return {
            type: element.type,
            id: element.id,
            x: element.x,
            y: element.y,
            width: element.width,
            height: element.height,
            backgroundColor: element.style?.backgroundColor ?? "transparent",
            strokeColor: element.style?.strokeColor ?? "#1e293b",
            label,
        };
    });

    for (const connection of diagram.connections) {
        const from = shapeById.get(connection.from);
        const to = shapeById.get(connection.to);
        if (!from || !to) {
            continue;
        }

        const bindable = from.type !== "text" && to.type !== "text";
        const start = bindable
            ? {
                  id: from.id,
                  type: from.type as "rectangle" | "ellipse" | "diamond",
              }
            : undefined;
        const end = bindable
            ? {
                  id: to.id,
                  type: to.type as "rectangle" | "ellipse" | "diamond",
              }
            : undefined;
        const startX = from.x + from.width / 2;
        const startY = from.y + from.height / 2;
        const endX = to.x + to.width / 2;
        const endY = to.y + to.height / 2;

        skeleton.push({
            type: "arrow",
            id: connection.id,
            x: startX,
            y: startY,
            points: [
                [0, 0],
                [endX - startX, endY - startY],
            ],
            ...(start && end ? { start, end } : {}),
            ...(connection.label
                ? {
                      label: {
                          text: connection.label,
                          fontSize: 14,
                      },
                  }
                : {}),
            customData: {
                diagramConnection: {
                    from: connection.from,
                    to: connection.to,
                },
            },
        });
    }

    const connectionById = new Map(
        diagram.connections.map((connection) => [connection.id, connection]),
    );

    return convertToExcalidrawElements(skeleton, { regenerateIds: false }).map((element) => {
        const connection = connectionById.get(element.id);
        if (element.type !== "arrow" || !connection) {
            return element;
        }
        return {
            ...element,
            customData: {
                ...element.customData,
                diagramConnection: {
                    from: connection.from,
                    to: connection.to,
                },
            },
        };
    });
}

export function fromExcalidrawElements(
    elements: readonly ExcalidrawElement[],
    diagramType: NormalizedDiagram["diagramType"],
    connectionHints: DiagramConnection[] = [],
): NormalizedDiagram {
    const liveElements = elements.filter((element) => !element.isDeleted);
    const textByContainer = new Map<string, string>();
    for (const element of liveElements) {
        if (element.type === "text" && element.containerId) {
            textByContainer.set(element.containerId, element.text);
        }
    }

    const shapes: DiagramElement[] = [];
    const connections: DiagramConnection[] = [];
    const shapeIds = new Set<string>();
    const connectionById = new Map(connectionHints.map((connection) => [connection.id, connection]));

    for (const element of liveElements) {
        if (element.type === "arrow") {
            const hintedConnection = connectionById.get(element.id);
            const customConnection = element.customData?.diagramConnection as
                | { from?: unknown; to?: unknown }
                | undefined;
            const from =
                element.startBinding?.elementId ??
                customConnection?.from ??
                hintedConnection?.from;
            const to =
                element.endBinding?.elementId ??
                customConnection?.to ??
                hintedConnection?.to;
            if (typeof from === "string" && typeof to === "string") {
                connections.push({
                    id: element.id,
                    from,
                    to,
                    ...(textByContainer.get(element.id) ?? hintedConnection?.label
                        ? { label: textByContainer.get(element.id) ?? hintedConnection?.label }
                        : {}),
                });
            }
            continue;
        }

        if (!isDiagramShape(element)) {
            continue;
        }
        shapeIds.add(element.id);
        if (element.type === "text" && element.containerId) {
            continue;
        }

        const text =
            element.type === "text"
                ? element.text
                : (textByContainer.get(element.id) ?? "");
        shapes.push({
            id: element.id,
            type: element.type,
            text,
            x: element.x,
            y: element.y,
            width: element.width,
            height: element.height,
            style: {
                backgroundColor: element.backgroundColor,
                strokeColor: element.strokeColor,
            },
        });
    }

    return {
        diagramType,
        elements: shapes,
        connections: connections.filter(
            (connection) => shapeIds.has(connection.from) && shapeIds.has(connection.to),
        ),
    };
}
