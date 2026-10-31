import {
  DIAGRAM_TYPES,
  type ApiEnvelope,
  type DiagramAction,
  type DiagramConnection,
  type DiagramElement,
  type DiagramType,
  type EditDiagramRequest,
  type EditDiagramResult,
  type ImageDiagramMode,
  type ImageDiagramResult,
  type ShapeType,
} from "@/lib/diagram-contract";
import { makeMockActions, makeMockImageDiagram } from "@/lib/sample-diagram";

const REQUEST_TIMEOUT_MS = 30_000;
export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg"] as const;
export const IS_MOCK_MODE = process.env.NEXT_PUBLIC_API_MOCK === "true";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDiagramType(value: unknown): value is DiagramType {
  return typeof value === "string" && DIAGRAM_TYPES.includes(value as DiagramType);
}

function isShapeType(value: unknown): value is ShapeType {
  return value === "rectangle" || value === "ellipse" || value === "diamond" || value === "text";
}

function isDiagramElement(value: unknown): value is DiagramElement {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    isShapeType(value.type) &&
    typeof value.text === "string" &&
    typeof value.x === "number" &&
    Number.isFinite(value.x) &&
    typeof value.y === "number" &&
    Number.isFinite(value.y) &&
    typeof value.width === "number" &&
    Number.isFinite(value.width) &&
    typeof value.height === "number" &&
    Number.isFinite(value.height) &&
    (!("style" in value) ||
      (isRecord(value.style) &&
        (!("backgroundColor" in value.style) || typeof value.style.backgroundColor === "string") &&
        (!("strokeColor" in value.style) || typeof value.style.strokeColor === "string")))
  );
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isShapeChanges(value: unknown): boolean {
  if (!isRecord(value) || !hasOnlyKeys(value, ["type", "text", "x", "y", "width", "height", "style"])) {
    return false;
  }
  if ("type" in value && !isShapeType(value.type)) {
    return false;
  }
  if ("text" in value && typeof value.text !== "string") {
    return false;
  }
  for (const key of ["x", "y", "width", "height"] as const) {
    if (key in value && (typeof value[key] !== "number" || !Number.isFinite(value[key]))) {
      return false;
    }
  }
  return (
    !("style" in value) ||
    (isRecord(value.style) &&
      hasOnlyKeys(value.style, ["backgroundColor", "strokeColor"]) &&
      (!("backgroundColor" in value.style) || typeof value.style.backgroundColor === "string") &&
      (!("strokeColor" in value.style) || typeof value.style.strokeColor === "string"))
  );
}

function isDiagramConnection(value: unknown): value is DiagramConnection {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.from === "string" &&
    value.from.length > 0 &&
    typeof value.to === "string" &&
    value.to.length > 0 &&
    (!("label" in value) || typeof value.label === "string")
  );
}

function isConnectionChanges(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["from", "to", "label"]) &&
    (!("from" in value) || (typeof value.from === "string" && value.from.length > 0)) &&
    (!("to" in value) || (typeof value.to === "string" && value.to.length > 0)) &&
    (!("label" in value) || typeof value.label === "string")
  );
}

function isDiagramAction(value: unknown): value is DiagramAction {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }
  switch (value.type) {
    case "create_shape":
      return isDiagramElement(value.element);
    case "update_shape":
      return typeof value.id === "string" && value.id.length > 0 && isShapeChanges(value.changes);
    case "delete_shape":
    case "delete_connection":
      return typeof value.id === "string" && value.id.length > 0;
    case "create_connection":
      return isDiagramConnection(value.connection);
    case "update_connection":
      return typeof value.id === "string" && value.id.length > 0 && isConnectionChanges(value.changes);
    case "arrange_layout":
      return (
        Array.isArray(value.positions) &&
        value.positions.every(
          (position) =>
            isRecord(position) &&
            typeof position.id === "string" &&
            typeof position.x === "number" &&
            typeof position.y === "number",
        )
      );
    default:
      return false;
  }
}

function isEditResult(value: unknown): value is EditDiagramResult {
  return (
    isRecord(value) &&
    typeof value.summary === "string" &&
    Array.isArray(value.actions) &&
    value.actions.every(isDiagramAction)
  );
}

function isImageResult(value: unknown): value is ImageDiagramResult {
  if (
    !isRecord(value) ||
    typeof value.summary !== "string" ||
    !isRecord(value.diagram) ||
    !Array.isArray(value.diagram.elements) ||
    !Array.isArray(value.diagram.connections)
  ) {
    return false;
  }

  const elements = value.diagram.elements.filter(isDiagramElement);
  return (
    elements.length === value.diagram.elements.length &&
    value.diagram.connections.every(
      (connection) =>
        isDiagramConnection(connection) &&
        elements.some((element) => element.id === connection.from) &&
        elements.some((element) => element.id === connection.to),
    )
  );
}

function apiUrl(path: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error("Set NEXT_PUBLIC_API_BASE_URL in frontend/.env.local to connect to the API.");
  }
  return `${baseUrl}${path}`;
}

async function waitForMockLatency(signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, 650);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("The request timed out.", "AbortError"));
      },
      { once: true },
    );
  });
}

async function requestData<T>(
  path: string,
  init: RequestInit,
  isExpectedData: (data: unknown) => data is T,
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(apiUrl(path), { ...init, signal: controller.signal });
    let envelope: unknown;
    try {
      envelope = await response.json();
    } catch {
      throw new Error(`The API returned an unreadable response (HTTP ${response.status}).`);
    }

    if (
      !isRecord(envelope) ||
      (envelope.status !== "success" && envelope.status !== "error") ||
      typeof envelope.message !== "string"
    ) {
      throw new Error(`The API returned a malformed response (HTTP ${response.status}).`);
    }
    if (envelope.status === "error") {
      throw new Error(envelope.message || `The API request failed (HTTP ${response.status}).`);
    }
    if (!response.ok) {
      throw new Error(envelope.message || `The API request failed (HTTP ${response.status}).`);
    }
    if (!isExpectedData(envelope.data)) {
      throw new Error("The API returned data in an unexpected format.");
    }

    return envelope.data;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("The request timed out. Please try again.");
    }
    if (error instanceof TypeError) {
      throw new Error("Could not reach the API. Check your connection and API URL.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function checkApiHealth(): Promise<void> {
  if (IS_MOCK_MODE) {
    const controller = new AbortController();
    await waitForMockLatency(controller.signal);
    return;
  }
  await requestData<unknown>("/health", {}, (_data): _data is unknown => true);
}

export async function requestDiagramEdit(
  request: EditDiagramRequest,
): Promise<EditDiagramResult> {
  if (request.scope === "selected" && request.selectedElementIds.length === 0) {
    throw new Error("Select at least one shape before using selected scope.");
  }

  if (IS_MOCK_MODE) {
    const controller = new AbortController();
    await waitForMockLatency(controller.signal);
    return makeMockActions(request.diagramType, request.prompt);
  }

  return requestData(
    "/ai/edit",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
    isEditResult,
  );
}

export async function requestImageDiagram(
  image: File,
  mode: ImageDiagramMode,
  diagramType: DiagramType,
): Promise<ImageDiagramResult> {
  if (IS_MOCK_MODE) {
    const controller = new AbortController();
    await waitForMockLatency(controller.signal);
    const { summary, diagram } = makeMockImageDiagram(diagramType);
    return { summary: `${summary} Mode: ${mode}.`, diagram };
  }

  const formData = new FormData();
  formData.append("image", image);
  formData.append("mode", mode);
  formData.append("diagramType", diagramType);

  return requestData(
    "/ai/image-to-diagram",
    { method: "POST", body: formData },
    isImageResult,
  );
}
