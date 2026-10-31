import type {
  DiagramAction,
  DiagramConnection,
  DiagramElement,
  DiagramPayload,
  UpdateConnectionAction,
  UpdateShapeAction,
} from "@/lib/diagram-contract";

export interface ActionInterpretation {
  diagram: DiagramPayload;
  skippedActions: string[];
}

function isKnownShape(id: string, elements: DiagramElement[]): boolean {
  return elements.some((element) => element.id === id);
}

function isKnownConnection(id: string, connections: DiagramConnection[]): boolean {
  return connections.some((connection) => connection.id === id);
}

function updateShape(
  action: UpdateShapeAction,
  elements: DiagramElement[],
): DiagramElement[] {
  return elements.map((element) =>
    element.id === action.id
      ? {
          ...element,
          ...action.changes,
          style: action.changes.style
            ? { ...element.style, ...action.changes.style }
            : element.style,
        }
      : element,
  );
}

function updateConnection(
  action: UpdateConnectionAction,
  connections: DiagramConnection[],
): DiagramConnection[] {
  return connections.map((connection) =>
    connection.id === action.id ? { ...connection, ...action.changes } : connection,
  );
}

export function interpretDiagramActions(
  current: DiagramPayload,
  actions: DiagramAction[],
): ActionInterpretation {
  let elements = [...current.elements];
  let connections = [...current.connections];
  const skippedActions: string[] = [];

  for (const action of actions) {
    switch (action.type) {
      case "create_shape": {
        if (isKnownShape(action.element.id, elements)) {
          skippedActions.push(`Create shape "${action.element.id}" was skipped because that ID already exists.`);
          break;
        }
        elements = [...elements, action.element];
        break;
      }
      case "update_shape": {
        if (!isKnownShape(action.id, elements)) {
          skippedActions.push(`Update shape "${action.id}" was skipped because it does not exist.`);
          break;
        }
        elements = updateShape(action, elements);
        break;
      }
      case "delete_shape": {
        if (!isKnownShape(action.id, elements)) {
          skippedActions.push(`Delete shape "${action.id}" was skipped because it does not exist.`);
          break;
        }
        elements = elements.filter((element) => element.id !== action.id);
        connections = connections.filter(
          (connection) => connection.from !== action.id && connection.to !== action.id,
        );
        break;
      }
      case "create_connection": {
        const { connection } = action;
        if (isKnownConnection(connection.id, connections)) {
          skippedActions.push(`Create connection "${connection.id}" was skipped because that ID already exists.`);
          break;
        }
        if (
          !isKnownShape(connection.from, elements) ||
          !isKnownShape(connection.to, elements)
        ) {
          skippedActions.push(`Create connection "${connection.id}" was skipped because an endpoint does not exist.`);
          break;
        }
        connections = [...connections, connection];
        break;
      }
      case "update_connection": {
        if (!isKnownConnection(action.id, connections)) {
          skippedActions.push(`Update connection "${action.id}" was skipped because it does not exist.`);
          break;
        }
        if (
          (action.changes.from && !isKnownShape(action.changes.from, elements)) ||
          (action.changes.to && !isKnownShape(action.changes.to, elements))
        ) {
          skippedActions.push(`Update connection "${action.id}" was skipped because an endpoint does not exist.`);
          break;
        }
        connections = updateConnection(action, connections);
        break;
      }
      case "delete_connection": {
        if (!isKnownConnection(action.id, connections)) {
          skippedActions.push(`Delete connection "${action.id}" was skipped because it does not exist.`);
          break;
        }
        connections = connections.filter((connection) => connection.id !== action.id);
        break;
      }
      case "arrange_layout": {
        for (const position of action.positions) {
          if (!isKnownShape(position.id, elements)) {
            skippedActions.push(`Layout position for "${position.id}" was skipped because it does not exist.`);
            continue;
          }
          elements = elements.map((element) =>
            element.id === position.id
              ? { ...element, x: position.x, y: position.y }
              : element,
          );
        }
        break;
      }
    }
  }

  return { diagram: { elements, connections }, skippedActions };
}
