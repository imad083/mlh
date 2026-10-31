import type {
  DiagramAction,
  DiagramType,
  NormalizedDiagram,
} from "@/lib/diagram-contract";

export const initialDiagram: NormalizedDiagram = {
  diagramType: "system_architecture",
  elements: [
    {
      id: "web-client",
      type: "rectangle",
      text: "Web client",
      x: 120,
      y: 205,
      width: 180,
      height: 88,
      style: { backgroundColor: "#eaf0ff", strokeColor: "#6175e8" },
    },
    {
      id: "api-server",
      type: "rectangle",
      text: "API server",
      x: 430,
      y: 205,
      width: 180,
      height: 88,
      style: { backgroundColor: "#f0ebff", strokeColor: "#8c68df" },
    },
    {
      id: "primary-database",
      type: "ellipse",
      text: "Database",
      x: 740,
      y: 205,
      width: 180,
      height: 88,
      style: { backgroundColor: "#e9f8f2", strokeColor: "#28a27a" },
    },
  ],
  connections: [
    { id: "client-to-api", from: "web-client", to: "api-server", label: "HTTPS" },
    { id: "api-to-db", from: "api-server", to: "primary-database", label: "SQL" },
  ],
};

export function makeMockActions(
  diagramType: DiagramType,
  prompt: string,
): { summary: string; actions: DiagramAction[] } {
  if (/all actions|every action|test actions/i.test(prompt)) {
    return {
      summary: "Demo: all seven action types are ready to review.",
      actions: [
        {
          type: "create_shape",
          element: {
            id: "mock-cache",
            type: "ellipse",
            text: "Redis cache",
            x: 640,
            y: 365,
            width: 156,
            height: 76,
            style: { backgroundColor: "#fff2e8", strokeColor: "#e08a48" },
          },
        },
        {
          type: "update_shape",
          id: "api-server",
          changes: { text: "API gateway" },
        },
        {
          type: "create_connection",
          connection: {
            id: "mock-cache-link",
            from: "api-server",
            to: "mock-cache",
            label: "Read / write",
          },
        },
        {
          type: "update_connection",
          id: "mock-cache-link",
          changes: { label: "Cache lookup" },
        },
        { type: "delete_connection", id: "client-to-api" },
        {
          type: "arrange_layout",
          positions: [
            { id: "web-client", x: 90, y: 180 },
            { id: "api-server", x: 390, y: 180 },
            { id: "primary-database", x: 720, y: 180 },
          ],
        },
        { type: "delete_shape", id: "mock-cache" },
      ],
    };
  }

  const cacheId = "redis-cache";
  return {
    summary: "Added a cache layer between the API and database.",
    actions: [
      {
        type: "create_shape",
        element: {
          id: cacheId,
          type: "rectangle",
          text: prompt.toLowerCase().includes("redis") ? "Redis cache" : "Cache",
          x: 650,
          y: 385,
          width: 168,
          height: 78,
          style: { backgroundColor: "#fff2e8", strokeColor: "#e08a48" },
        },
      },
      {
        type: "create_connection",
        connection: {
          id: "api-cache-link",
          from: "api-server",
          to: cacheId,
          label: "Cache read / write",
        },
      },
      {
        type: "create_connection",
        connection: {
          id: "cache-database-link",
          from: cacheId,
          to: "primary-database",
          label: "Cache miss",
        },
      },
    ],
  };
}

export function makeMockImageDiagram(diagramType: DiagramType) {
  return {
    summary: "Diagram reconstructed. You can adjust any shape before applying it.",
    diagram: {
      elements: [
        {
          id: "image-client",
          type: "rectangle" as const,
          text: "Web app",
          x: 150,
          y: 170,
          width: 170,
          height: 84,
          style: { backgroundColor: "#eaf0ff", strokeColor: "#6175e8" },
        },
        {
          id: "image-api",
          type: "rectangle" as const,
          text: "Service API",
          x: 470,
          y: 170,
          width: 170,
          height: 84,
          style: { backgroundColor: "#f0ebff", strokeColor: "#8c68df" },
        },
        {
          id: "image-data",
          type: "ellipse" as const,
          text: "Data store",
          x: 790,
          y: 170,
          width: 170,
          height: 84,
          style: { backgroundColor: "#e9f8f2", strokeColor: "#28a27a" },
        },
      ],
      connections: [
        { id: "image-client-api", from: "image-client", to: "image-api", label: "Request" },
        { id: "image-api-data", from: "image-api", to: "image-data", label: "Query" },
      ],
    },
    diagramType,
  };
}
