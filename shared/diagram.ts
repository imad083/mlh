export const diagramTypes = [
    "system_architecture",
    "flowchart",
    "uml_class",
    "database_erd",
    "sequence_diagram",
] as const;

export type DiagramType = (typeof diagramTypes)[number];
export type ShapeType = "rectangle" | "ellipse" | "diamond" | "text";

export interface DiagramStyle {
    backgroundColor?: string;
    strokeColor?: string;
}

export interface DiagramElement {
    id: string;
    type: ShapeType;
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    style?: DiagramStyle;
}

export interface DiagramConnection {
    id: string;
    from: string;
    to: string;
    label?: string;
}

export interface NormalizedDiagram {
    diagramType: DiagramType;
    elements: DiagramElement[];
    connections: DiagramConnection[];
}

export type EditScope = "selected" | "all";

export interface EditRequest {
    prompt: string;
    diagramType: DiagramType;
    scope: EditScope;
    selectedElementIds: string[];
    diagram: Pick<NormalizedDiagram, "elements" | "connections">;
}

export type DiagramAction =
    | { type: "create_shape"; element: DiagramElement }
    | {
          type: "update_shape";
          id: string;
          changes: Partial<Omit<DiagramElement, "id">>;
      }
    | { type: "delete_shape"; id: string }
    | { type: "create_connection"; connection: DiagramConnection }
    | {
          type: "update_connection";
          id: string;
          changes: Partial<Omit<DiagramConnection, "id">>;
      }
    | { type: "delete_connection"; id: string }
    | {
          type: "arrange_layout";
          positions: Array<{ id: string; x: number; y: number }>;
      };

export interface EditResponseData {
    summary: string;
    actions: DiagramAction[];
}

export type ImageMode = "recreate" | "reconstruct";

export interface ImageDiagramResponseData {
    summary: string;
    diagram: Pick<NormalizedDiagram, "elements" | "connections">;
}

export interface ApiSuccess<T> {
    status: "success";
    data: T;
    message: string;
}

export interface ApiError {
    status: "error";
    data: null;
    message: string;
}
