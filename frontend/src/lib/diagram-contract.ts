export const DIAGRAM_TYPES = [
  "system_architecture",
  "flowchart",
  "uml_class",
  "database_erd",
  "sequence_diagram",
] as const;

export type DiagramType = (typeof DIAGRAM_TYPES)[number];
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

export interface DiagramPayload {
  elements: DiagramElement[];
  connections: DiagramConnection[];
}

export type DiagramScope = "selected" | "all";
export type ImageDiagramMode = "recreate" | "reconstruct";

export interface EditDiagramRequest {
  prompt: string;
  diagramType: DiagramType;
  scope: DiagramScope;
  selectedElementIds: string[];
  diagram: DiagramPayload;
}

export interface CreateShapeAction {
  type: "create_shape";
  element: DiagramElement;
}

export interface UpdateShapeAction {
  type: "update_shape";
  id: string;
  changes: Partial<Omit<DiagramElement, "id">>;
}

export interface DeleteShapeAction {
  type: "delete_shape";
  id: string;
}

export interface CreateConnectionAction {
  type: "create_connection";
  connection: DiagramConnection;
}

export interface UpdateConnectionAction {
  type: "update_connection";
  id: string;
  changes: Partial<Omit<DiagramConnection, "id">>;
}

export interface DeleteConnectionAction {
  type: "delete_connection";
  id: string;
}

export interface ArrangeLayoutAction {
  type: "arrange_layout";
  positions: Array<{ id: string; x: number; y: number }>;
}

export type DiagramAction =
  | CreateShapeAction
  | UpdateShapeAction
  | DeleteShapeAction
  | CreateConnectionAction
  | UpdateConnectionAction
  | DeleteConnectionAction
  | ArrangeLayoutAction;

export interface EditDiagramResult {
  summary: string;
  actions: DiagramAction[];
}

export interface ImageDiagramResult {
  summary: string;
  diagram: DiagramPayload;
}

export type ApiEnvelope<T> =
  | { status: "success"; data: T; message: string }
  | { status: "error"; data: null; message: string };

export const DIAGRAM_TYPE_LABELS: Record<DiagramType, string> = {
  system_architecture: "System architecture",
  flowchart: "Flowchart",
  uml_class: "UML class",
  database_erd: "Database ERD",
  sequence_diagram: "Sequence diagram",
};
