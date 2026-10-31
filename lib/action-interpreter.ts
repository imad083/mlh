import type {
    DiagramAction,
    NormalizedDiagram,
} from "@/shared/diagram";

export interface ActionInterpretation {
    diagram: Pick<NormalizedDiagram, "elements" | "connections">;
    skipped: string[];
}

export function applyDiagramActions(
    diagram: Pick<NormalizedDiagram, "elements" | "connections">,
    actions: DiagramAction[],
): ActionInterpretation {
    const elements = diagram.elements.map((element) => ({ ...element }));
    const connections = diagram.connections.map((connection) => ({ ...connection }));
    const skipped: string[] = [];

    for (const action of actions) {
        switch (action.type) {
            case "create_shape":
                if (
                    elements.some((element) => element.id === action.element.id) ||
                    connections.some((connection) => connection.id === action.element.id)
                ) {
                    skipped.push(`Create shape "${action.element.id}": that ID already exists.`);
                } else {
                    elements.push({ ...action.element });
                }
                break;
            case "update_shape": {
                const index = elements.findIndex((element) => element.id === action.id);
                if (index < 0) {
                    skipped.push(`Update shape "${action.id}": the ID does not exist.`);
                } else {
                    const { style, ...changes } = action.changes;
                    elements[index] = {
                        ...elements[index],
                        ...changes,
                        ...(style ? { style: { ...elements[index].style, ...style } } : {}),
                        id: action.id,
                    };
                }
                break;
            }
            case "delete_shape": {
                const index = elements.findIndex((element) => element.id === action.id);
                if (index < 0) {
                    skipped.push(`Delete shape "${action.id}": the ID does not exist.`);
                } else {
                    elements.splice(index, 1);
                    for (let connectionIndex = connections.length - 1; connectionIndex >= 0; connectionIndex--) {
                        const connection = connections[connectionIndex];
                        if (connection.from === action.id || connection.to === action.id) {
                            connections.splice(connectionIndex, 1);
                        }
                    }
                }
                break;
            }
            case "create_connection":
                if (
                    connections.some((connection) => connection.id === action.connection.id) ||
                    elements.some((element) => element.id === action.connection.id)
                ) {
                    skipped.push(
                        `Create connection "${action.connection.id}": that ID already exists.`,
                    );
                } else if (
                    !elements.some((element) => element.id === action.connection.from) ||
                    !elements.some((element) => element.id === action.connection.to)
                ) {
                    skipped.push(
                        `Create connection "${action.connection.id}": an endpoint ID does not exist.`,
                    );
                } else {
                    connections.push({ ...action.connection });
                }
                break;
            case "update_connection": {
                const index = connections.findIndex((connection) => connection.id === action.id);
                if (index < 0) {
                    skipped.push(`Update connection "${action.id}": the ID does not exist.`);
                } else {
                    const updated = { ...connections[index], ...action.changes, id: action.id };
                    if (
                        !elements.some((element) => element.id === updated.from) ||
                        !elements.some((element) => element.id === updated.to)
                    ) {
                        skipped.push(
                            `Update connection "${action.id}": an endpoint ID does not exist.`,
                        );
                    } else {
                        connections[index] = updated;
                    }
                }
                break;
            }
            case "delete_connection": {
                const index = connections.findIndex((connection) => connection.id === action.id);
                if (index < 0) {
                    skipped.push(`Delete connection "${action.id}": the ID does not exist.`);
                } else {
                    connections.splice(index, 1);
                }
                break;
            }
            case "arrange_layout":
                for (const position of action.positions) {
                    const element = elements.find((candidate) => candidate.id === position.id);
                    if (!element) {
                        skipped.push(`Arrange layout "${position.id}": the ID does not exist.`);
                    } else {
                        element.x = position.x;
                        element.y = position.y;
                    }
                }
                break;
        }
    }

    return { diagram: { elements, connections }, skipped };
}

export function describeAction(action: DiagramAction): string {
    switch (action.type) {
        case "create_shape":
            return `Create ${action.element.type}: ${action.element.text || action.element.id}`;
        case "update_shape":
            return `Update shape: ${action.changes.text ?? action.id}`;
        case "delete_shape":
            return `Delete shape: ${action.id}`;
        case "create_connection":
            return `Connect ${action.connection.from} to ${action.connection.to}`;
        case "update_connection":
            return `Update connection: ${action.id}`;
        case "delete_connection":
            return `Delete connection: ${action.id}`;
        case "arrange_layout":
            return `Move ${action.positions.length} element${action.positions.length === 1 ? "" : "s"}`;
    }
}
