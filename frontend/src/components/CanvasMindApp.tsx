"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import {
  ACCEPTED_IMAGE_TYPES,
  IS_MOCK_MODE,
  MAX_IMAGE_SIZE_BYTES,
  checkApiHealth,
  requestDiagramEdit,
  requestImageDiagram,
} from "@/lib/api-client";
import { interpretDiagramActions } from "@/lib/action-interpreter";
import {
  DIAGRAM_TYPES,
  DIAGRAM_TYPE_LABELS,
  type DiagramAction,
  type DiagramScope,
  type DiagramType,
  type ImageDiagramMode,
  type NormalizedDiagram,
} from "@/lib/diagram-contract";
import { initialDiagram } from "@/lib/sample-diagram";

const DiagramCanvas = dynamic(() => import("@/components/DiagramCanvas"), {
  ssr: false,
  loading: () => <div className="canvas-loading">Opening your canvas…</div>,
});

type ApiStatus = "checking" | "online" | "offline";
type Notice = { tone: "error" | "success" | "warning"; message: string } | null;

const iconPaths: Record<string, ReactNode> = {
  spark: (
    <>
      <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
      <path d="m19 14 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14ZM5 3l.7 1.8L7.5 5.5l-1.8.7L5 8l-.7-1.8-1.8-.7 1.8-.7L5 3Z" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4m0 0L7 9m5-5 5 5" />
      <path d="M20 16.5v2A2.5 2.5 0 0 1 17.5 21h-11A2.5 2.5 0 0 1 4 18.5v-2" />
    </>
  ),
  plus: <path d="M12 5v14m-7-7h14" />,
  close: <path d="m18 6-12 12M6 6l12 12" />,
  check: <path d="m5 12 4 4L19 6" />,
  alert: (
    <>
      <path d="M12 9v4m0 4h.01" />
      <path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4-.1Z" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v12m0 0 5-5m-5 5-5-5" />
      <path d="M4 20h16" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
    </>
  ),
  arrow: <path d="M7 17 17 7M7 7h10v10" />,
  wand: (
    <>
      <path d="m15 4 5 5M3 21l12-12M6 18l-3-3M15 5l-3-3M20 14l2 2M8 4l1-2m10 11 2-1" />
      <path d="m15 8 1.5-1.5" />
    </>
  ),
  file: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6M8 13h8m-8 4h8" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 7v5h-5M4 17v-5h5" />
      <path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2" />
    </>
  ),
};

function Icon({
  name,
  size = 18,
  className,
}: {
  name: keyof typeof iconPaths;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {iconPaths[name]}
    </svg>
  );
}

function actionSummary(action: DiagramAction): string {
  switch (action.type) {
    case "create_shape":
      return `Create ${action.element.type}: ${action.element.text || "Untitled shape"}`;
    case "update_shape":
      return `Update shape: ${action.changes.text ?? action.id}`;
    case "delete_shape":
      return `Delete shape: ${action.id}`;
    case "create_connection":
      return `Connect ${action.connection.from} → ${action.connection.to}`;
    case "update_connection":
      return `Update connection: ${action.id}`;
    case "delete_connection":
      return `Remove connection: ${action.id}`;
    case "arrange_layout":
      return `Move ${action.positions.length} ${action.positions.length === 1 ? "shape" : "shapes"}`;
  }
}

function actionTone(action: DiagramAction): string {
  if (action.type.startsWith("create")) {
    return "create";
  }
  if (action.type.startsWith("delete")) {
    return "delete";
  }
  if (action.type === "arrange_layout") {
    return "layout";
  }
  return "update";
}

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CanvasMindApp() {
  const [diagram, setDiagram] = useState(initialDiagram);
  const diagramRef = useRef<NormalizedDiagram>(initialDiagram);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [diagramType, setDiagramType] = useState<DiagramType>(initialDiagram.diagramType);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [canvasReady, setCanvasReady] = useState(false);
  const [scope, setScope] = useState<DiagramScope>("all");
  const [prompt, setPrompt] = useState("");
  const [pendingEdit, setPendingEdit] = useState<{
    summary: string;
    actions: DiagramAction[];
  } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [panelMode, setPanelMode] = useState<"ai" | "image">("ai");
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");
  const [notice, setNotice] = useState<Notice>(null);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageMode, setImageMode] = useState<ImageDiagramMode>("reconstruct");
  const [isUploading, setIsUploading] = useState(false);
  const [imagePreview, setImagePreview] = useState<{
    diagram: NormalizedDiagram;
    summary: string;
  } | null>(null);
  const [previewDiagram, setPreviewDiagram] = useState<NormalizedDiagram | null>(null);

  useEffect(() => {
    let active = true;
    void checkApiHealth()
      .then(() => {
        if (active) {
          setApiStatus("online");
        }
      })
      .catch(() => {
        if (active) {
          setApiStatus("offline");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const handleDiagramChange = useCallback((nextDiagram: NormalizedDiagram) => {
    diagramRef.current = nextDiagram;
    setDiagram(nextDiagram);
  }, []);

  const handleSelectionChange = useCallback((ids: string[]) => {
    const shapeIds = new Set(diagramRef.current.elements.map((element) => element.id));
    setSelectedIds(ids.filter((id) => shapeIds.has(id)));
  }, []);

  const handleCanvasApiReady = useCallback((api: ExcalidrawImperativeAPI) => {
    apiRef.current = api;
    setCanvasReady(true);
  }, []);

  function updateDiagramType(value: string) {
    if (DIAGRAM_TYPES.includes(value as DiagramType)) {
      setDiagramType(value as DiagramType);
      diagramRef.current = { ...diagramRef.current, diagramType: value as DiagramType };
      setDiagram((current) => ({ ...current, diagramType: value as DiagramType }));
    }
  }

  async function handleGenerateEdit() {
    if (!prompt.trim()) {
      setNotice({ tone: "error", message: "Add a short prompt describing your diagram change." });
      return;
    }
    if (scope === "selected" && selectedIds.length === 0) {
      setNotice({ tone: "error", message: "Select one or more shapes on the canvas first." });
      return;
    }

    setIsEditing(true);
    setNotice(null);
    setPendingEdit(null);
    try {
      const result = await requestDiagramEdit({
        prompt: prompt.trim(),
        diagramType,
        scope,
        selectedElementIds: scope === "selected" ? selectedIds : [],
        diagram: {
          elements: diagramRef.current.elements,
          connections: diagramRef.current.connections,
        },
      });
      setPendingEdit(result);
      if (result.actions.length === 0) {
        setNotice({ tone: "warning", message: "The AI returned no changes to preview." });
      }
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not generate diagram changes.",
      });
    } finally {
      setIsEditing(false);
    }
  }

  async function applyEdit() {
    if (!pendingEdit) {
      return;
    }
    if (!apiRef.current) {
      setNotice({ tone: "error", message: "The canvas is still loading. Please try again in a moment." });
      return;
    }
    const { toExcalidrawElements } = await import("@/lib/diagram-converter");
    const result = interpretDiagramActions(diagramRef.current, pendingEdit.actions);
    const nextDiagram = { ...result.diagram, diagramType };
    apiRef.current.updateScene({
      elements: toExcalidrawElements(nextDiagram),
      captureUpdate: "IMMEDIATELY",
    });
    diagramRef.current = nextDiagram;
    setDiagram(nextDiagram);
    setSelectedIds([]);
    setNotice(
      result.skippedActions.length
        ? {
            tone: "warning",
            message: `Applied valid changes. Skipped ${result.skippedActions.length} action${result.skippedActions.length === 1 ? "" : "s"}: ${result.skippedActions.join(" ")}`,
          }
        : { tone: "success", message: "Changes applied to your canvas." },
    );
    setPendingEdit(null);
  }

  function validateImage(file: File): boolean {
    const isAcceptedType = ACCEPTED_IMAGE_TYPES.includes(
      file.type as (typeof ACCEPTED_IMAGE_TYPES)[number],
    );
    if (!isAcceptedType) {
      setImageFile(null);
      setNotice({ tone: "error", message: "Choose a PNG or JPG/JPEG image." });
      return false;
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setImageFile(null);
      setNotice({
        tone: "error",
        message: `This image is ${formatBytes(file.size)}. The maximum size is 10 MB.`,
      });
      return false;
    }
    setNotice(null);
    setImageFile(file);
    return true;
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      validateImage(file);
    }
    event.target.value = "";
  }

  async function handleImageUpload() {
    if (!imageFile) {
      setNotice({ tone: "error", message: "Choose a PNG or JPEG image to continue." });
      return;
    }
    setIsUploading(true);
    setNotice(null);
    try {
      const result = await requestImageDiagram(imageFile, imageMode, diagramType);
      const nextPreview: NormalizedDiagram = {
        diagramType,
        elements: result.diagram.elements,
        connections: result.diagram.connections,
      };
      setImagePreview({ diagram: nextPreview, summary: result.summary });
      setPreviewDiagram(nextPreview);
      setImageFile(null);
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not process this image.",
      });
    } finally {
      setIsUploading(false);
    }
  }

  async function applyImagePreview() {
    if (!previewDiagram) {
      return;
    }
    if (!apiRef.current) {
      setNotice({ tone: "error", message: "The canvas is still loading. Please try again in a moment." });
      return;
    }
    const { toExcalidrawElements } = await import("@/lib/diagram-converter");
    const nextDiagram = { ...previewDiagram, diagramType };
    apiRef.current.updateScene({
      elements: toExcalidrawElements(nextDiagram),
      captureUpdate: "IMMEDIATELY",
    });
    diagramRef.current = nextDiagram;
    setDiagram(nextDiagram);
    setSelectedIds([]);
    setImagePreview(null);
    setPreviewDiagram(null);
    setNotice({ tone: "success", message: "Reconstructed diagram applied to the canvas." });
  }

  function closeImagePreview() {
    setImagePreview(null);
    setPreviewDiagram(null);
  }

  function exportDiagram() {
    const json = JSON.stringify(diagramRef.current, null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "canvasmind-diagram.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  function openSamplePrompt() {
    setScope("all");
    setPrompt("Try all actions to see every preview type");
    setNotice(null);
  }

  return (
    <main className="workspace">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><Icon name="spark" size={19} /></div>
          <span>canvas<span className="brand-light">mind</span></span>
          <span className="workspace-badge">WORKSPACE</span>
        </div>
        <div className="topbar-center">
          <span className={`api-indicator ${apiStatus}`} />
          <span>{apiStatus === "checking" ? "Connecting…" : apiStatus === "online" ? "API connected" : "API unavailable"}</span>
          {IS_MOCK_MODE && <span className="mock-badge">MOCK MODE</span>}
        </div>
        <div className="topbar-actions">
          <button className="text-button" onClick={exportDiagram} title="Download normalized diagram JSON">
            <Icon name="download" size={16} />
            <span>Export</span>
          </button>
          <div className="avatar" aria-label="Local workspace">C</div>
        </div>
      </header>

      <div className="workspace-body">
        <aside className="assistant-panel">
          <div className="panel-heading">
            <div className="panel-icon"><Icon name={panelMode === "ai" ? "spark" : "image"} size={18} /></div>
            <div>
              <p className="eyebrow">CANVASMIND AI</p>
              <h1>Diagram studio</h1>
            </div>
          </div>

          <div className="mode-tabs" role="tablist" aria-label="Diagram workflow">
            <button
              className={panelMode === "ai" ? "mode-tab active" : "mode-tab"}
              role="tab"
              aria-selected={panelMode === "ai"}
              onClick={() => { setPanelMode("ai"); setNotice(null); }}
            >
              <Icon name="wand" size={15} /> AI edit
            </button>
            <button
              className={panelMode === "image" ? "mode-tab active" : "mode-tab"}
              role="tab"
              aria-selected={panelMode === "image"}
              onClick={() => { setPanelMode("image"); setNotice(null); }}
            >
              <Icon name="image" size={15} /> From image
            </button>
          </div>

          {notice && (
            <div className={`notice ${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
              <Icon name={notice.tone === "success" ? "check" : "alert"} size={16} />
              <span>{notice.message}</span>
              <button aria-label="Dismiss notification" onClick={() => setNotice(null)}>
                <Icon name="close" size={14} />
              </button>
            </div>
          )}

          {panelMode === "ai" ? (
            <section className="panel-content">
              {pendingEdit ? (
                <div className="action-preview">
                  <button className="back-link" onClick={() => setPendingEdit(null)}>
                    <span aria-hidden="true">←</span> Back to prompt
                  </button>
                  <div className="preview-heading">
                    <div className="preview-heading-icon"><Icon name="eye" size={16} /></div>
                    <div>
                      <h2>Review changes</h2>
                      <p>{pendingEdit.actions.length} proposed {pendingEdit.actions.length === 1 ? "change" : "changes"}</p>
                    </div>
                  </div>
                  <div className="summary-card">{pendingEdit.summary}</div>
                  <div className="action-list">
                    {pendingEdit.actions.map((action, index) => (
                      <div className="action-row" key={`${action.type}-${index}`}>
                        <span className={`action-dot ${actionTone(action)}`}><Icon name={actionTone(action) === "create" ? "plus" : actionTone(action) === "delete" ? "close" : actionTone(action) === "layout" ? "layers" : "arrow"} size={13} /></span>
                        <span>{actionSummary(action)}</span>
                      </div>
                    ))}
                    {pendingEdit.actions.length === 0 && (
                      <p className="empty-note">There are no changes to apply.</p>
                    )}
                  </div>
                  <div className="preview-footer">
                    <button className="button-secondary" onClick={() => setPendingEdit(null)}>Cancel</button>
                    <button className="button-primary" onClick={applyEdit} disabled={pendingEdit.actions.length === 0 || !canvasReady}>
                      <Icon name="check" size={16} /> Apply changes
                    </button>
                  </div>
                  <p className="undo-note">Applied as one undoable step · Cmd/Ctrl + Z to undo</p>
                </div>
              ) : (
                <>
                  <div className="field-group">
                    <label className="field-label" htmlFor="diagram-type">Diagram type</label>
                    <select id="diagram-type" value={diagramType} onChange={(event) => updateDiagramType(event.target.value)}>
                      {DIAGRAM_TYPES.map((type) => <option value={type} key={type}>{DIAGRAM_TYPE_LABELS[type]}</option>)}
                    </select>
                  </div>

                  <div className="field-group">
                    <span className="field-label">Apply to</span>
                    <div className="scope-control">
                      <button className={scope === "all" ? "scope-option selected" : "scope-option"} onClick={() => setScope("all")}>
                        <Icon name="layers" size={15} /> Entire diagram
                      </button>
                      <button className={scope === "selected" ? "scope-option selected" : "scope-option"} onClick={() => setScope("selected")}>
                        <Icon name="plus" size={15} /> Selection
                      </button>
                    </div>
                    {scope === "selected" && (
                      <p className={selectedIds.length ? "selection-hint ready" : "selection-hint"}>
                        {selectedIds.length ? `${selectedIds.length} shape${selectedIds.length === 1 ? "" : "s"} selected` : "Select shapes on the canvas"}
                      </p>
                    )}
                  </div>

                  <div className="field-group prompt-group">
                    <label className="field-label" htmlFor="edit-prompt">What should change?</label>
                    <textarea
                      id="edit-prompt"
                      value={prompt}
                      onChange={(event) => setPrompt(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void handleGenerateEdit();
                        }
                      }}
                      placeholder="Describe the change you want to make…"
                      rows={5}
                      maxLength={2000}
                    />
                    <div className="textarea-meta"><span>Be specific for better results</span><span>{prompt.length}/2000</span></div>
                  </div>

                  <button className="button-primary generate-button" onClick={handleGenerateEdit} disabled={isEditing}>
                    {isEditing ? <span className="spinner" /> : <Icon name="spark" size={17} />}
                    {isEditing ? "Thinking…" : "Generate preview"}
                    {!isEditing && <span className="button-shortcut">↵</span>}
                  </button>
                  {IS_MOCK_MODE && (
                    <button className="sample-link" onClick={openSamplePrompt}>
                      <Icon name="refresh" size={13} /> Try a sample with all 7 action types
                    </button>
                  )}

                  <div className="suggestion-block">
                    <p className="field-label">Try asking</p>
                    <button className="suggestion-chip" onClick={() => setPrompt("Add Redis cache between the API and database")}>
                      <span className="suggestion-spark">✦</span> Add a cache layer
                    </button>
                    <button className="suggestion-chip" onClick={() => setPrompt("Group related services and arrange them in a clean left-to-right layout")}>
                      <span className="suggestion-spark">✦</span> Clean up the layout
                    </button>
                    <button className="suggestion-chip" onClick={() => setPrompt("Label the connections with the protocols they use")}>
                      <span className="suggestion-spark">✦</span> Add connection labels
                    </button>
                  </div>

                  <div className="panel-footnote">
                    <Icon name="eye" size={14} />
                    AI changes are always previewed before they touch your canvas.
                  </div>
                </>
              )}
            </section>
          ) : (
            <section className="panel-content image-flow">
              <div className="image-intro">
                <span className="step-number">01</span>
                <div><h2>Upload a reference</h2><p>We’ll turn your sketch or screenshot into editable shapes.</p></div>
              </div>

              <div
                className="upload-zone"
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const file = event.dataTransfer.files[0];
                  if (file) {
                    validateImage(file);
                  }
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,.jpg,.jpeg,.png"
                  onChange={handleFileChange}
                  hidden
                />
                <div className="upload-icon"><Icon name={imageFile ? "file" : "upload"} size={20} /></div>
                {imageFile ? (
                  <>
                    <strong className="file-name">{imageFile.name}</strong>
                    <span>{formatBytes(imageFile.size)} · Click to replace</span>
                  </>
                ) : (
                  <>
                    <strong>Drop an image here</strong>
                    <span>or <span className="browse-link">browse files</span></span>
                    <small>PNG or JPG · max 10 MB</small>
                  </>
                )}
              </div>

              <div className="field-group">
                <span className="field-label">Reconstruction mode</span>
                <div className="mode-choice">
                  <button className={imageMode === "reconstruct" ? "choice-card active" : "choice-card"} onClick={() => setImageMode("reconstruct")}>
                    <span className="choice-glyph">◫</span>
                    <span><strong>Reconstruct</strong><small>Match the original layout</small></span>
                    <span className="radio-dot" />
                  </button>
                  <button className={imageMode === "recreate" ? "choice-card active" : "choice-card"} onClick={() => setImageMode("recreate")}>
                    <span className="choice-glyph">✧</span>
                    <span><strong>Recreate</strong><small>Rebuild with a clean layout</small></span>
                    <span className="radio-dot" />
                  </button>
                </div>
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="image-diagram-type">Diagram type</label>
                <select id="image-diagram-type" value={diagramType} onChange={(event) => updateDiagramType(event.target.value)}>
                  {DIAGRAM_TYPES.map((type) => <option value={type} key={type}>{DIAGRAM_TYPE_LABELS[type]}</option>)}
                </select>
              </div>

              <button className="button-primary generate-button" onClick={handleImageUpload} disabled={isUploading || !imageFile}>
                {isUploading ? <span className="spinner" /> : <Icon name="spark" size={17} />}
                {isUploading ? "Reading image…" : "Reconstruct diagram"}
              </button>
              <p className="privacy-note">Your image is sent to the configured API for processing.</p>
            </section>
          )}

          <div className="panel-bottom">
            <div className="bottom-status">
              <span className={`api-indicator ${apiStatus}`} />
              <span>{apiStatus === "online" ? "Ready to create" : apiStatus === "checking" ? "Checking connection" : "Working offline"}</span>
            </div>
            <span className="bottom-version">{IS_MOCK_MODE ? "MOCK API" : "CANVASMIND"}</span>
          </div>
        </aside>

        <section className="canvas-workspace" aria-label="Diagram canvas">
          <div className="canvas-toolbar">
            <div className="canvas-title">
              <div className="canvas-file-icon"><Icon name="file" size={16} /></div>
              <div>
                <strong>Untitled diagram</strong>
                <span>{DIAGRAM_TYPE_LABELS[diagramType]} <span className="title-dot">·</span> {diagram.elements.length} shapes</span>
              </div>
              <span className="saved-badge"><span /> In this session</span>
            </div>
            <div className="canvas-actions">
              <button className="share-button" onClick={exportDiagram}><Icon name="download" size={15} /> Export JSON</button>
            </div>
          </div>

          <div className="canvas-stage">
            {diagram.elements.length === 0 && (
              <div className="canvas-empty"><Icon name="layers" size={20} /><strong>Your canvas is empty</strong><span>Use the shape tools or create a diagram with AI.</span></div>
            )}
            <div className="canvas-shell">
              <DiagramCanvas
                diagram={diagram}
                onDiagramChange={handleDiagramChange}
                onApiReady={handleCanvasApiReady}
                onSelectionChange={handleSelectionChange}
              />
            </div>
            <div className="canvas-tip"><Icon name="wand" size={14} /> Select a shape to refine it with AI</div>
          </div>
          <div className="canvas-footer">
            <div className="canvas-footer-left"><Icon name="layers" size={14} /><span>{diagram.elements.length} shapes</span><span className="footer-divider">·</span><span>{diagram.connections.length} connections</span></div>
            <div className="canvas-footer-right"><span className={`api-indicator ${apiStatus}`} /><span>{IS_MOCK_MODE ? "Local mock responses" : apiStatus === "online" ? "Synced with API" : "Canvas stays on this device"}</span></div>
          </div>
        </section>
      </div>

      {imagePreview && previewDiagram && (
        <div className="modal-backdrop" role="presentation">
          <section className="image-preview-modal" role="dialog" aria-modal="true" aria-labelledby="preview-title">
            <header className="modal-header">
              <div className="preview-heading-icon"><Icon name="eye" size={16} /></div>
              <div><h2 id="preview-title">Review reconstructed diagram</h2><p>{imagePreview.summary}</p></div>
              <button className="icon-button modal-close" aria-label="Close preview" onClick={closeImagePreview}><Icon name="close" size={17} /></button>
            </header>
            <div className="preview-canvas canvas-shell">
              <DiagramCanvas
                key="image-preview-canvas"
                diagram={previewDiagram}
                onDiagramChange={setPreviewDiagram}
              />
              {previewDiagram.elements.length === 0 && (
                <div className="preview-empty-tip">No shapes were detected — draw a diagram here to continue.</div>
              )}
            </div>
            <footer className="modal-footer">
              <span><Icon name="wand" size={14} /> Edit the temporary diagram before applying.</span>
              <div>
                <button className="button-secondary" onClick={closeImagePreview}>Cancel</button>
                <button className="button-primary" onClick={applyImagePreview} disabled={previewDiagram.elements.length === 0 || !canvasReady}>
                  <Icon name="check" size={16} /> Apply to canvas
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}
