import type {
    ApiSuccess,
    DiagramAction,
    DiagramElement,
    DiagramConnection,
    DiagramType,
    EditRequest,
    EditResponseData,
    ImageDiagramResponseData,
    ImageMode,
} from "@/shared/diagram";

const REQUEST_TIMEOUT_MS = 30_000;

export class ApiRequestError extends Error {
    constructor(
        message: string,
        readonly statusCode?: number,
    ) {
        super(message);
        this.name = "ApiRequestError";
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDiagramType(value: unknown): value is DiagramType {
    return (
        value === "system_architecture" ||
        value === "flowchart" ||
        value === "uml_class" ||
        value === "database_erd" ||
        value === "sequence_diagram"
    );
}

function isDiagramElement(value: unknown): value is DiagramElement {
    if (
        !isRecord(value) ||
        typeof value.id !== "string" ||
        value.id.length === 0 ||
        typeof value.text !== "string" ||
        !["rectangle", "ellipse", "diamond", "text"].includes(String(value.type)) ||
        ![value.x, value.y].every(
            (number) => typeof number === "number" && Number.isFinite(number),
        ) ||
        ![value.width, value.height].every(
            (number) => typeof number === "number" && Number.isFinite(number) && number > 0,
        )
    ) {
        return false;
    }
    return (
        value.style === undefined ||
        (isRecord(value.style) &&
            (value.style.backgroundColor === undefined ||
                typeof value.style.backgroundColor === "string") &&
            (value.style.strokeColor === undefined || typeof value.style.strokeColor === "string"))
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
        (value.label === undefined || typeof value.label === "string")
    );
}

function isAction(value: unknown): value is DiagramAction {
    if (!isRecord(value) || typeof value.type !== "string") return false;
    switch (value.type) {
        case "create_shape":
            return isDiagramElement(value.element);
        case "update_shape": {
            if (typeof value.id !== "string" || !isRecord(value.changes)) return false;
            const changes = value.changes;
            return (
                Object.keys(changes).every((key) =>
                    ["type", "text", "x", "y", "width", "height", "style"].includes(key),
                ) &&
                (changes.type === undefined ||
                    ["rectangle", "ellipse", "diamond", "text"].includes(String(changes.type))) &&
                (changes.text === undefined || typeof changes.text === "string") &&
                ["x", "y"].every(
                    (key) =>
                        changes[key] === undefined ||
                        (typeof changes[key] === "number" && Number.isFinite(changes[key])),
                ) &&
                ["width", "height"].every(
                    (key) =>
                        changes[key] === undefined ||
                        (typeof changes[key] === "number" &&
                            Number.isFinite(changes[key]) &&
                            changes[key] > 0),
                ) &&
                (changes.style === undefined ||
                    (isRecord(changes.style) &&
                        (changes.style.backgroundColor === undefined ||
                            typeof changes.style.backgroundColor === "string") &&
                        (changes.style.strokeColor === undefined ||
                            typeof changes.style.strokeColor === "string")))
            );
        }
        case "delete_shape":
        case "delete_connection":
            return typeof value.id === "string";
        case "create_connection":
            return isDiagramConnection(value.connection);
        case "update_connection":
            if (typeof value.id !== "string" || !isRecord(value.changes)) return false;
            {
                const changes = value.changes;
            return (
                Object.keys(changes).every((key) => ["from", "to", "label"].includes(key)) &&
                ["from", "to", "label"].every(
                    (key) =>
                        changes[key] === undefined ||
                        typeof changes[key] === "string",
                )
            );
            }
        case "arrange_layout":
            return (
                Array.isArray(value.positions) &&
                value.positions.every(
                    (position) =>
                        isRecord(position) &&
                        typeof position.id === "string" &&
                        typeof position.x === "number" &&
                        Number.isFinite(position.x) &&
                        typeof position.y === "number" &&
                        Number.isFinite(position.y),
                )
            );
        default:
            return false;
    }
}

function isEditResponseData(value: unknown): value is EditResponseData {
    return (
        isRecord(value) &&
        typeof value.summary === "string" &&
        Array.isArray(value.actions) &&
        value.actions.every(isAction)
    );
}

function isImageDiagramResponseData(value: unknown): value is ImageDiagramResponseData {
    if (
        !isRecord(value) ||
        typeof value.summary !== "string" ||
        !isRecord(value.diagram) ||
        !Array.isArray(value.diagram.elements) ||
        !value.diagram.elements.every(isDiagramElement) ||
        !Array.isArray(value.diagram.connections) ||
        !value.diagram.connections.every(isDiagramConnection)
    ) {
        return false;
    }

    const shapeIds = new Set(value.diagram.elements.map((element) => element.id));
    const ids = new Set(shapeIds);
    for (const connection of value.diagram.connections) {
        if (
            ids.has(connection.id) ||
            !shapeIds.has(connection.from) ||
            !shapeIds.has(connection.to)
        ) {
            return false;
        }
        ids.add(connection.id);
    }
    return shapeIds.size === value.diagram.elements.length;
}

function isEnvelope<T>(
    value: unknown,
): value is { status: "success"; data: T; message: string } | { status: "error"; data: null; message: string } {
    return (
        isRecord(value) &&
        (value.status === "success" || value.status === "error") &&
        typeof value.message === "string" &&
        (value.status !== "error" || value.data === null)
    );
}

async function request<T>(
    path: string,
    init: RequestInit,
    signal: AbortSignal,
    validate: (value: unknown) => boolean,
): Promise<ApiSuccess<T>> {
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "");
    if (!baseUrl) {
        throw new ApiRequestError(
            "NEXT_PUBLIC_API_BASE_URL is not configured. Add it to your frontend environment.",
        );
    }

    let response: Response;
    try {
        response = await fetch(`${baseUrl}${path}`, { ...init, signal });
    } catch (error) {
        if (signal.aborted) {
            throw new ApiRequestError("The request timed out. Please try again.");
        }
        throw new ApiRequestError(
            error instanceof Error
                ? `Could not reach the API: ${error.message}`
                : "Could not reach the API. Check your connection and try again.",
        );
    }

    let body: unknown;
    try {
        body = await response.json();
    } catch {
        if (signal.aborted) {
            throw new ApiRequestError("The request timed out. Please try again.");
        }
        throw new ApiRequestError(
            `The API returned an unreadable response (HTTP ${response.status}).`,
            response.status,
        );
    }

    if (!isEnvelope<T>(body)) {
        throw new ApiRequestError(
            `The API returned an invalid response (HTTP ${response.status}).`,
            response.status,
        );
    }
    if (!response.ok || body.status !== "success") {
        throw new ApiRequestError(
            body.message || `The API request failed (HTTP ${response.status}).`,
            response.status,
        );
    }
    if (!validate(body.data)) {
        throw new ApiRequestError("The API returned an invalid success payload.", response.status);
    }

    return body as ApiSuccess<T>;
}

function mockModeEnabled(): boolean {
    return process.env.NEXT_PUBLIC_API_MOCK_MODE === "true";
}

function mockEditResponse(requestData: EditRequest): ApiSuccess<EditResponseData> {
    const nextIndex = requestData.diagram.elements.length + 1;
    const element = {
        id: `mock-service-${nextIndex}`,
        type: "rectangle" as const,
        text: requestData.prompt.trim() || "New service",
        x: 180 + (nextIndex % 3) * 220,
        y: 180 + (nextIndex % 2) * 140,
        width: 180,
        height: 80,
        style: { backgroundColor: "#e9e6ff", strokeColor: "#7167e8" },
    };
    return {
        status: "success",
        message: "Mock edit ready to preview.",
        data: {
            summary: `Mock edit: added ${element.text}.`,
            actions: [{ type: "create_shape", element }],
        },
    };
}

export async function editDiagram(
    data: EditRequest,
    signal: AbortSignal,
): Promise<ApiSuccess<EditResponseData>> {
    if (mockModeEnabled()) {
        await new Promise((resolve) => setTimeout(resolve, 450));
        if (signal.aborted) {
            throw new ApiRequestError("The request timed out. Please try again.");
        }
        return mockEditResponse(data);
    }
    return request<EditResponseData>(
        "/ai/edit",
        {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(data),
        },
        signal,
        isEditResponseData,
    );
}

export async function createDiagramFromImage(
    image: File,
    mode: ImageMode,
    diagramType: DiagramType,
    signal: AbortSignal,
): Promise<ApiSuccess<ImageDiagramResponseData>> {
    if (mockModeEnabled()) {
        await new Promise((resolve) => setTimeout(resolve, 650));
        if (signal.aborted) {
            throw new ApiRequestError("The request timed out. Please try again.");
        }
        return {
            status: "success",
            message: "Mock image diagram ready to preview.",
            data: {
                summary: `Mock ${mode} preview for ${image.name}.`,
                diagram: {
                    elements: [
                        {
                            id: "image-source",
                            type: "rectangle",
                            text: "Source",
                            x: 100,
                            y: 120,
                            width: 160,
                            height: 76,
                            style: {
                                backgroundColor: "#e9e6ff",
                                strokeColor: "#7167e8",
                            },
                        },
                        {
                            id: "image-output",
                            type: "ellipse",
                            text: "Result",
                            x: 400,
                            y: 120,
                            width: 160,
                            height: 76,
                            style: {
                                backgroundColor: "#e9f8ef",
                                strokeColor: "#36a269",
                            },
                        },
                    ],
                    connections: [
                        {
                            id: "image-flow",
                            from: "image-source",
                            to: "image-output",
                            label: "flow",
                        },
                    ],
                },
            },
        };
    }

    const formData = new FormData();
    formData.append("image", image);
    formData.append("mode", mode);
    formData.append("diagramType", diagramType);
    return request<ImageDiagramResponseData>(
        "/ai/image-to-diagram",
        { method: "POST", headers: { Accept: "application/json" }, body: formData },
        signal,
        isImageDiagramResponseData,
    );
}

export async function checkApiHealth(signal: AbortSignal): Promise<void> {
    if (mockModeEnabled()) return;
    await request<unknown>(
        "/health",
        { method: "GET", headers: { Accept: "application/json" } },
        signal,
        () => true,
    );
}

export async function withTimeout<T>(
    task: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        return await task(controller.signal);
    } finally {
        clearTimeout(timeout);
    }
}
