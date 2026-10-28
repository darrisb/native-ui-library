/** MIME type carrying a component-palette drag payload in `DataTransfer`. */
export const PALETTE_DRAG_MIME_TYPE = "application/x-visual-ui-component";

/** MIME type carrying a builder-canvas move payload in `DataTransfer`. */
export const CANVAS_DRAG_MIME_TYPE = "application/x-visual-ui-move";

/** Component types currently supported for canvas insertion. */
const INSERTABLE_COMPONENT_TYPES: ReadonlySet<string> = new Set([
  "card",
  "text",
  "button",
]);

/** Component types that may be inserted at the document root. */
const ROOT_INSERTABLE_COMPONENT_TYPES: ReadonlySet<string> = new Set(["card"]);

/** Upper bound on a serialized payload; real payloads are well under 100 bytes. */
const MAX_PAYLOAD_LENGTH = 512;

/**
 * Data carried by a palette drag.
 *
 * Deliberately minimal: it identifies the palette as the source and names the
 * component type. It carries no markup, instance ids, or executable content.
 */
export interface PaletteDragPayload {
  readonly source: "component-palette";
  readonly componentType: string;
}

/** Returns true when the component type may currently be inserted into the canvas. */
export function isInsertableComponentType(type: string): boolean {
  return INSERTABLE_COMPONENT_TYPES.has(type);
}

/** Returns true when the component type may be inserted at the document root. */
export function isRootInsertableComponentType(type: string): boolean {
  return ROOT_INSERTABLE_COMPONENT_TYPES.has(type);
}

/**
 * Creates a drag payload for an insertable component type.
 *
 * @throws Error when the component type is not supported for insertion.
 */
export function createPaletteDragPayload(
  componentType: string
): PaletteDragPayload {
  if (!isInsertableComponentType(componentType)) {
    throw new Error(`Component type "${componentType}" cannot be dragged.`);
  }
  return { source: "component-palette", componentType };
}

/** Serializes a payload for storage in `DataTransfer`. */
export function serializePaletteDragPayload(
  payload: PaletteDragPayload
): string {
  return JSON.stringify({
    source: payload.source,
    componentType: payload.componentType,
  });
}

/**
 * Parses serialized drag data.
 *
 * Returns `null` for anything that is not a well-formed payload from the
 * palette naming a supported component type. Never throws. Only the known
 * fields are copied into the result; any other fields are discarded.
 */
export function parsePaletteDragPayload(
  raw: string | null | undefined
): PaletteDragPayload | null {
  if (typeof raw !== "string" || raw.length === 0) {
    return null;
  }
  if (raw.length > MAX_PAYLOAD_LENGTH) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  const { source, componentType } = parsed as Record<string, unknown>;
  if (source !== "component-palette") {
    return null;
  }
  if (typeof componentType !== "string" || !isInsertableComponentType(componentType)) {
    return null;
  }

  return { source: "component-palette", componentType };
}

/** Returns true when the drag carries the palette MIME type. */
export function hasPaletteDragType(
  dataTransfer: Pick<DataTransfer, "types"> | null | undefined
): boolean {
  if (!dataTransfer || !dataTransfer.types) {
    return false;
  }
  return Array.from(dataTransfer.types).includes(PALETTE_DRAG_MIME_TYPE);
}

/**
 * Data carried by a canvas move drag.
 *
 * Contains only the id of the instance being moved; the builder state validates
 * the actual move on drop.
 */
export interface CanvasMovePayload {
  readonly source: "builder-canvas";
  readonly componentId: string;
}

/**
 * Creates a drag payload for moving an existing canvas component.
 *
 * @throws Error when the component id is empty.
 */
export function createCanvasMovePayload(componentId: string): CanvasMovePayload {
  if (typeof componentId !== "string" || componentId.length === 0) {
    throw new Error("A valid component id is required for a move payload.");
  }
  return { source: "builder-canvas", componentId };
}

/** Serializes a canvas move payload for storage in `DataTransfer`. */
export function serializeCanvasMovePayload(
  payload: CanvasMovePayload
): string {
  return JSON.stringify({
    source: payload.source,
    componentId: payload.componentId,
  });
}

/**
 * Parses serialized canvas move data.
 *
 * Returns `null` for anything that is not a well-formed payload from the
 * canvas naming a non-empty component id. Never throws. Only the known fields
 * are copied into the result; any other fields are discarded.
 */
export function parseCanvasMovePayload(
  raw: string | null | undefined
): CanvasMovePayload | null {
  if (typeof raw !== "string" || raw.length === 0) {
    return null;
  }
  if (raw.length > MAX_PAYLOAD_LENGTH) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  const { source, componentId } = parsed as Record<string, unknown>;
  if (source !== "builder-canvas") {
    return null;
  }
  if (typeof componentId !== "string" || componentId.length === 0) {
    return null;
  }

  return { source: "builder-canvas", componentId };
}

/** Returns true when the drag carries the canvas move MIME type. */
export function hasCanvasDragType(
  dataTransfer: Pick<DataTransfer, "types"> | null | undefined
): boolean {
  if (!dataTransfer || !dataTransfer.types) {
    return false;
  }
  return Array.from(dataTransfer.types).includes(CANVAS_DRAG_MIME_TYPE);
}

/** Returns true when the drag carries any builder-owned MIME type. */
export function hasBuilderDragType(
  dataTransfer: Pick<DataTransfer, "types"> | null | undefined
): boolean {
  return hasPaletteDragType(dataTransfer) || hasCanvasDragType(dataTransfer);
}
