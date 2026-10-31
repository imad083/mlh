"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
    CaptureUpdateAction,
} from "@excalidraw/excalidraw";
import type {
    AppState,
    ExcalidrawImperativeAPI,
    ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import {
    diagramTypes,
    type DiagramAction,
    type DiagramType,
    type EditScope,
    type ImageMode,
    type NormalizedDiagram,
} from "@/shared/diagram";
import { checkApiHealth, createDiagramFromImage, editDiagram, withTimeout } from "@/lib/api";
import { applyDiagramActions, describeAction } from "@/lib/action-interpreter";
import { fromExcalidrawElements, toExcalidrawElements } from "@/lib/diagram-converter";

const Excalidraw = dynamic(
    async () => (await import("@excalidraw/excalidraw")).Excalidraw,
    { ssr: false },
);

const initialDiagram: NormalizedDiagram = {
    diagramType: "system_architecture",
    elements: [
        {
            id: "client",
            type: "rectangle",
            text: "Web client",
            x: 90,
            y: 170,
            width: 190,
            height: 90,
            style: { backgroundColor: "#eaf2ff", strokeColor: "#6794e8" },
        },
        {
            id: "api",
            type: "rectangle",
            text: "API server",
            x: 410,
            y: 170,
            width: 190,
            height: 90,
            style: { backgroundColor: "#f0edff", strokeColor: "#8a7ae8" },
        },
        {
            id: "database",
            type: "ellipse",
            text: "Database",
            x: 740,
            y: 170,
            width: 180,
            height: 90,
            style: { backgroundColor: "#e9f8ef", strokeColor: "#56ab79" },
        },
    ],
    connections: [
        { id: "client-api", from: "client", to: "api", label: "HTTPS" },
        { id: "api-database", from: "api", to: "database", label: "SQL" },
    ],
};

const diagramLabels: Record<DiagramType, string> = {
    system_architecture: "System architecture",
    flowchart: "Flowchart",
    uml_class: "UML class",
    database_erd: "Database ERD",
    sequence_diagram: "Sequence diagram",
};

const maxImageSize = 10 * 1024 * 1024;
const allowedImageTypes = new Set(["image/png", "image/jpeg", "image/jpg"]);
const allowedImageExtensions = new Set(["png", "jpg", "jpeg"]);

function formatDiagramType(type: DiagramType): string {
    return diagramLabels[type];
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function formatFileSize(size: number): string {
    return size < 1024 * 1024
        ? `${Math.max(1, Math.round(size / 1024))} KB`
        : `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function preservesUnmappedElements(
    elements: readonly ExcalidrawElement[],
    diagram: Pick<NormalizedDiagram, "elements" | "connections">,
): ExcalidrawElement[] {
    const managedIds = new Set([
        ...diagram.elements.map((element) => element.id),
        ...diagram.connections.map((connection) => connection.id),
    ]);
    return elements.filter(
        (element) =>
            !managedIds.has(element.id) &&
            !(element.type === "text" && element.containerId && managedIds.has(element.containerId)),
    );
}

function useCurrentDiagram(
    elements: readonly ExcalidrawElement[],
    diagramType: DiagramType,
    connectionHints: NormalizedDiagram["connections"],
): NormalizedDiagram {
    return useMemo(
        () => fromExcalidrawElements(elements, diagramType, connectionHints),
        [connectionHints, diagramType, elements],
    );
}

export default function CanvasMind() {
    const [diagramType, setDiagramType] = useState<DiagramType>(initialDiagram.diagramType);
    const initialElements = useMemo(() => toExcalidrawElements(initialDiagram), []);
    const initialData = useMemo(() => ({ elements: initialElements }), [initialElements]);
    const [editorElements, setEditorElements] =
        useState<readonly ExcalidrawElement[]>(initialElements);
    const [connectionHints, setConnectionHints] = useState(initialDiagram.connections);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [prompt, setPrompt] = useState("");
    const [scope, setScope] = useState<EditScope>("all");
    const [busy, setBusy] = useState<"edit" | "image" | null>(null);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [summary, setSummary] = useState("");
    const [pendingActions, setPendingActions] = useState<DiagramAction[] | null>(null);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imageMode, setImageMode] = useState<ImageMode>("reconstruct");
    const [showImagePreview, setShowImagePreview] = useState(false);
    const [imageInitialData, setImageInitialData] = useState<ExcalidrawInitialDataState>();
    const [previewElements, setPreviewElements] = useState<readonly ExcalidrawElement[]>([]);
    const [previewConnections, setPreviewConnections] =
        useState<NormalizedDiagram["connections"]>([]);
    const [previewSummary, setPreviewSummary] = useState("");
    const [previewDiagramType, setPreviewDiagramType] = useState<DiagramType>(initialDiagram.diagramType);
    const [apiOnline, setApiOnline] = useState<boolean | null>(null);
    const editorRef = useRef<ExcalidrawImperativeAPI | null>(null);
    const previewRef = useRef<ExcalidrawImperativeAPI | null>(null);
    const diagram = useCurrentDiagram(editorElements, diagramType, connectionHints);

    useEffect(() => {
        let active = true;
        withTimeout((signal) => checkApiHealth(signal))
            .then(() => {
                if (active) setApiOnline(true);
            })
            .catch(() => {
                if (active) setApiOnline(false);
            });
        return () => {
            active = false;
        };
    }, []);

    const onEditorChange = useCallback(
        (nextElements: readonly ExcalidrawElement[], appState: AppState) => {
            setEditorElements(nextElements);
            setSelectedIds(
                Object.entries(appState.selectedElementIds)
                    .filter(([, selected]) => selected)
                    .map(([id]) => id),
            );
        },
        [],
    );
    const onEditorApi = useCallback((api: ExcalidrawImperativeAPI) => {
        editorRef.current = api;
    }, []);
    const onPreviewApi = useCallback((api: ExcalidrawImperativeAPI) => {
        previewRef.current = api;
    }, []);
    const onPreviewChange = useCallback((elements: readonly ExcalidrawElement[]) => {
        setPreviewElements(elements);
    }, []);

    async function requestEdit() {
        setError("");
        setNotice("");
        setSummary("");
        if (!prompt.trim()) {
            setError("Write a prompt describing the change you want.");
            return;
        }
        if (scope === "selected" && selectedIds.length === 0) {
            setError("Select one or more canvas elements before using selected scope.");
            return;
        }

        setBusy("edit");
        try {
            const response = await withTimeout((signal) =>
                editDiagram(
                    {
                        prompt: prompt.trim(),
                        diagramType,
                        scope,
                        selectedElementIds: scope === "selected" ? selectedIds : [],
                        diagram: {
                            elements: diagram.elements,
                            connections: diagram.connections,
                        },
                    },
                    signal,
                ),
            );
            setPendingActions(response.data.actions);
            setSummary(response.data.summary);
        } catch (requestError) {
            setError(getErrorMessage(requestError));
        } finally {
            setBusy(null);
        }
    }

    function applyPendingActions() {
        if (!pendingActions || !editorRef.current) {
            return;
        }
        const result = applyDiagramActions(
            { elements: diagram.elements, connections: diagram.connections },
            pendingActions,
        );
        const preserved = preservesUnmappedElements(editorElements, diagram);
        editorRef.current.updateScene({
            elements: [...toExcalidrawElements(result.diagram), ...preserved],
            captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });
        setConnectionHints(result.diagram.connections);
        setPendingActions(null);
        setPrompt("");
        setNotice(
            result.skipped.length
                ? `Changes applied. Skipped ${result.skipped.length} invalid action${result.skipped.length === 1 ? "" : "s"}: ${result.skipped.join(" ")}`
                : "All changes applied to your canvas.",
        );
    }

    function validateImage(file: File | undefined): file is File {
        if (!file) return false;
        const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
        if (
            !allowedImageTypes.has(file.type) &&
            !(file.type === "" && allowedImageExtensions.has(extension))
        ) {
            setError("Choose a PNG, JPG, or JPEG image.");
            return false;
        }
        if (file.size === 0) {
            setError("The selected image is empty. Choose another file.");
            return false;
        }
        if (file.size > maxImageSize) {
            setError("Image must be 10 MB or smaller.");
            return false;
        }
        setImageFile(file);
        setError("");
        setNotice("");
        return true;
    }

    async function requestImageDiagram() {
        if (!imageFile) {
            setError("Choose a PNG, JPG, or JPEG image first.");
            return;
        }
        setBusy("image");
        setError("");
        setNotice("");
        try {
            const response = await withTimeout((signal) =>
                createDiagramFromImage(imageFile, imageMode, diagramType, signal),
            );
            const normalized = {
                diagramType,
                elements: response.data.diagram.elements,
                connections: response.data.diagram.connections,
            };
            const elements = toExcalidrawElements(normalized);
            setPreviewDiagramType(diagramType);
            setPreviewSummary(response.data.summary);
            setPreviewElements(elements);
            setPreviewConnections(response.data.diagram.connections);
            setImageInitialData({ elements });
            setShowImagePreview(true);
        } catch (requestError) {
            setError(getErrorMessage(requestError));
        } finally {
            setBusy(null);
        }
    }

    function applyImagePreview() {
        if (!previewRef.current || !editorRef.current) return;
        const currentPreview =
            previewRef.current.getSceneElements() ?? previewElements;
        const normalizedWithConnections = fromExcalidrawElements(
            currentPreview,
            previewDiagramType,
            previewConnections,
        );
        const preserved = preservesUnmappedElements(editorElements, diagram);
        editorRef.current.updateScene({
            elements: [...toExcalidrawElements(normalizedWithConnections), ...preserved],
            captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });
        setConnectionHints(normalizedWithConnections.connections);
        setDiagramType(previewDiagramType);
        setShowImagePreview(false);
        setNotice("Reconstructed diagram added to your canvas.");
    }

    const selectedCount = selectedIds.length;
    const actionGroups = useMemo(() => {
        const counts = new Map<string, number>();
        for (const action of pendingActions ?? []) {
            const key =
                action.type === "create_shape" || action.type === "create_connection"
                    ? "Create"
                    : action.type === "delete_shape" || action.type === "delete_connection"
                      ? "Delete"
                      : action.type === "arrange_layout"
                        ? "Arrange"
                        : "Update";
            counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        return [...counts.entries()];
    }, [pendingActions]);

    return (
        <main className="workspace">
            <header className="topbar">
                <a className="brand" href="/" aria-label="CanvasMind home">
                    <span className="brand-mark">C</span>
                    <span>canvasmind</span>
                    <span className="brand-divider" />
                    <span className="file-name">Untitled canvas</span>
                </a>
                <div className="topbar-center">
                    <span className={`live-dot ${apiOnline === false ? "offline-dot" : ""}`} />
                    {apiOnline === null
                        ? "Checking API connection…"
                        : apiOnline
                          ? "API connected · canvas stays in this browser"
                          : "API offline · check your connection"}
                </div>
                <div className="topbar-right">
                    <span className="avatar">Y</span>
                    <button className="share-button" type="button" onClick={() => setNotice("Canvas export and sharing are coming soon.")}>Share canvas</button>
                </div>
            </header>

            <div className="workspace-body">
                <aside className="assistant-panel">
                    <div className="panel-heading">
                        <div>
                            <span className="eyebrow">YOUR CREATIVE PARTNER</span>
                            <h1>Think it.<br /><span>Diagram it.</span></h1>
                        </div>
                        <span className="sparkle" aria-hidden="true">✳</span>
                    </div>
                    <p className="intro-copy">Describe what you want to build, or turn a sketch into a diagram.</p>

                    <section className="prompt-section">
                        <label className="section-label" htmlFor="diagram-prompt">ASK CANVASMIND</label>
                        <textarea
                            id="diagram-prompt"
                            className="prompt-input"
                            value={prompt}
                            onChange={(event) => setPrompt(event.target.value)}
                            placeholder="Add a cache layer between the API and database..."
                            rows={5}
                            disabled={busy !== null}
                        />
                        <div className="prompt-tools">
                            <label className="select-wrap">
                                <span className="sr-only">Diagram type</span>
                                <select
                                    value={diagramType}
                                    onChange={(event) => setDiagramType(event.target.value as DiagramType)}
                                    disabled={busy !== null}
                                >
                                    {diagramTypes.map((type) => (
                                        <option key={type} value={type}>{formatDiagramType(type)}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="select-wrap scope-select">
                                <span className="sr-only">Edit scope</span>
                                <select
                                    value={scope}
                                    onChange={(event) => setScope(event.target.value as EditScope)}
                                    disabled={busy !== null}
                                >
                                    <option value="all">Entire canvas</option>
                                    <option value="selected">Selected elements</option>
                                </select>
                            </label>
                        </div>
                        {scope === "selected" && (
                            <p className={`scope-hint ${selectedCount ? "" : "scope-hint-warning"}`}>
                                {selectedCount
                                    ? `${selectedCount} selected element${selectedCount === 1 ? "" : "s"} will be sent`
                                    : "Select elements on the canvas to continue"}
                            </p>
                        )}
                        <button
                            className="primary-button generate-button"
                            type="button"
                            onClick={requestEdit}
                            disabled={busy !== null}
                        >
                            {busy === "edit" ? <span className="spinner" /> : <span aria-hidden="true">✳</span>}
                            {busy === "edit" ? "Thinking…" : "Generate changes"}
                            {busy !== "edit" && <span className="button-shortcut">↵</span>}
                        </button>
                    </section>

                    <div className="panel-separator"><span>OR</span></div>

                    <section className="image-section">
                        <div className="section-title-row">
                            <div>
                                <label className="section-label" htmlFor="diagram-image">IMAGE TO DIAGRAM</label>
                                <p className="section-caption">Bring a sketch to life</p>
                            </div>
                            <span className="image-icon" aria-hidden="true">▧</span>
                        </div>
                        <label className={`upload-box ${imageFile ? "has-file" : ""}`} htmlFor="diagram-image">
                            <input
                                id="diagram-image"
                                type="file"
                                accept="image/png,image/jpeg,.jpg,.jpeg"
                                onChange={(event) => {
                                    validateImage(event.target.files?.[0]);
                                    event.currentTarget.value = "";
                                }}
                            />
                            <span className="upload-symbol">{imageFile ? "✓" : "↑"}</span>
                            <span className="upload-text">
                                {imageFile ? imageFile.name : <>Drop an image or <strong>browse</strong></>}
                            </span>
                            <span className="upload-meta">{imageFile ? `${formatFileSize(imageFile.size)} · ready` : "PNG or JPG · max 10 MB"}</span>
                        </label>
                        <div className="mode-row" role="group" aria-label="Image conversion mode">
                            {(["reconstruct", "recreate"] as const).map((mode) => (
                                <button
                                    type="button"
                                    key={mode}
                                    className={`mode-option ${imageMode === mode ? "active" : ""}`}
                                    onClick={() => setImageMode(mode)}
                                    aria-pressed={imageMode === mode}
                                >
                                    <span className="mode-check">{imageMode === mode ? "✓" : ""}</span>
                                    <span><strong>{mode === "reconstruct" ? "Reconstruct" : "Recreate"}</strong><small>{mode === "reconstruct" ? "Keep the original layout" : "Make it clean & consistent"}</small></span>
                                </button>
                            ))}
                        </div>
                        <button
                            className="secondary-button image-button"
                            type="button"
                            onClick={requestImageDiagram}
                            disabled={busy !== null || !imageFile}
                        >
                            {busy === "image" ? <span className="spinner dark-spinner" /> : null}
                            {busy === "image" ? "Reading your image…" : "Create diagram from image"}
                            {busy !== "image" && <span aria-hidden="true">↗</span>}
                        </button>
                    </section>

                    <div className="panel-footnote">
                        <span className="footnote-sparkle">✳</span>
                        Your canvas is yours. No account needed.
                    </div>
                </aside>

                <section className="canvas-column" aria-label="Diagram canvas">
                    <div className="canvas-toolbar">
                        <div className="canvas-heading">
                            <span className="canvas-kicker">WORKSPACE / {formatDiagramType(diagramType).toUpperCase()}</span>
                            <h2>Untitled canvas <span className="edit-pencil">✎</span></h2>
                        </div>
                        <div className="canvas-stats">
                            <span><i className="stat-dot shapes-dot" />{diagram.elements.length} shapes</span>
                            <span><i className="stat-dot links-dot" />{diagram.connections.length} connections</span>
                            <span className="selection-stat">{selectedCount ? `${selectedCount} selected` : "Nothing selected"}</span>
                        </div>
                    </div>

                    {(error || notice) && (
                        <div className={`toast-message ${error ? "error-toast" : "success-toast"}`} role={error ? "alert" : "status"}>
                            <span>{error ? "!" : "✓"}</span>
                            <p>{error || notice}</p>
                            <button type="button" onClick={() => { setError(""); setNotice(""); }} aria-label="Dismiss message">×</button>
                        </div>
                    )}

                    <div className="canvas-wrap">
                        <Excalidraw
                            excalidrawAPI={onEditorApi}
                            initialData={initialData}
                            onChange={onEditorChange}
                            theme="light"
                            UIOptions={{
                                canvasActions: {
                                    changeViewBackgroundColor: false,
                                    clearCanvas: true,
                                    export: false,
                                    loadScene: false,
                                    saveToActiveFile: false,
                                    toggleTheme: false,
                                    saveAsImage: false,
                                },
                            }}
                        />
                        <div className="canvas-help">
                            <kbd>Space</kbd> + drag to pan <span>·</span> <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Z</kbd> to undo
                        </div>
                    </div>

                    {pendingActions && (
                        <div className="action-preview" role="region" aria-label="AI changes preview">
                            <div className="preview-header">
                                <div className="preview-title-wrap">
                                    <span className="preview-icon">✳</span>
                                    <div>
                                        <strong>Review your changes</strong>
                                        <p>{summary || "CanvasMind has a few ideas for your canvas."}</p>
                                    </div>
                                </div>
                                <button className="preview-close" type="button" onClick={() => setPendingActions(null)} aria-label="Cancel preview">×</button>
                            </div>
                            <div className="action-chips">
                                {actionGroups.map(([label, count]) => (
                                    <span className={`action-chip ${label.toLowerCase()}`} key={label}>
                                        <i />{count} {label.toLowerCase()}
                                    </span>
                                ))}
                                <span className="action-total">{pendingActions.length} action{pendingActions.length === 1 ? "" : "s"}</span>
                            </div>
                            {pendingActions.length > 0 ? (
                                <ul className="action-list">
                                    {pendingActions.map((action, index) => (
                                        <li key={`${action.type}-${"id" in action ? action.id : index}-${index}`}>
                                            <span className={`action-marker ${action.type.startsWith("create") ? "created" : action.type.startsWith("delete") ? "deleted" : "updated"}`}>
                                                {action.type.startsWith("create") ? "+" : action.type.startsWith("delete") ? "−" : "↗"}
                                            </span>
                                            {describeAction(action)}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="empty-preview">No changes suggested. Your diagram is ready as-is.</p>
                            )}
                            <div className="preview-actions">
                                <button className="text-button" type="button" onClick={() => setPendingActions(null)}>Cancel</button>
                                <button className="primary-button apply-button" type="button" onClick={applyPendingActions} disabled={pendingActions.length === 0}>Apply changes <span>→</span></button>
                            </div>
                        </div>
                    )}
                </section>
            </div>

            {showImagePreview && imageInitialData && (
                <div className="modal-backdrop" role="presentation">
                    <section className="image-preview-modal" role="dialog" aria-modal="true" aria-labelledby="image-preview-title">
                        <header className="modal-header">
                            <div>
                                <span className="eyebrow">IMAGE CONVERSION · {imageMode.toUpperCase()}</span>
                                <h2 id="image-preview-title">Your diagram is ready to refine</h2>
                                <p>{previewSummary} Edit the preview below; your original canvas is untouched.</p>
                            </div>
                            <button className="preview-close" type="button" onClick={() => setShowImagePreview(false)} aria-label="Close preview">×</button>
                        </header>
                        <div className="modal-canvas">
                            {previewElements.every((element) => element.isDeleted) && (
                                <div className="empty-image-preview">
                                    <strong>No diagram elements were detected.</strong>
                                    <span>Add shapes manually in this preview, or cancel and try another image.</span>
                                </div>
                            )}
                            <Excalidraw
                                excalidrawAPI={onPreviewApi}
                                initialData={imageInitialData}
                                onChange={onPreviewChange}
                                theme="light"
                                UIOptions={{
                                    canvasActions: {
                                        changeViewBackgroundColor: false,
                                        clearCanvas: true,
                                        export: false,
                                        loadScene: false,
                                        saveToActiveFile: false,
                                        toggleTheme: false,
                                        saveAsImage: false,
                                    },
                                }}
                            />
                        </div>
                        <footer className="modal-footer">
                            <span><i className="stat-dot shapes-dot" /> {previewElements.filter((element) => !element.isDeleted && element.type !== "arrow").length} elements · Select and edit anything before applying</span>
                            <div>
                                <button className="text-button" type="button" onClick={() => setShowImagePreview(false)}>Cancel</button>
                                <button className="primary-button apply-button" type="button" onClick={applyImagePreview}>Apply to canvas <span>→</span></button>
                            </div>
                        </footer>
                    </section>
                </div>
            )}
        </main>
    );
}
