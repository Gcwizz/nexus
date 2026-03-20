import { randomUUID } from 'crypto';
import type { ProcessMap, CanvasState } from '@nexus/contracts/processes';
import type { EditOperation, Changeset, TargetDesignState } from '../types';

// ── Grid Snapping ───────────────────────────────────────────────

const GRID_SIZE = 20;

function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function snapPosition(pos: { x: number; y: number }): { x: number; y: number } {
  return { x: snapToGrid(pos.x), y: snapToGrid(pos.y) };
}

// ── Element Operations ──────────────────────────────────────────

export function addElement(
  canvasState: CanvasState,
  processId: string,
  element: {
    type: string;
    name?: string;
    position: { x: number; y: number };
    size?: { width: number; height: number };
    properties?: Record<string, unknown>;
  },
  userId: string,
): { canvasState: CanvasState; operation: EditOperation } {
  const process = canvasState.processes.find((p) => p.id === processId);
  if (!process) {
    throw new Error(`Process ${processId} not found in canvas state`);
  }

  const snapped = snapPosition(element.position);
  const newElement = {
    id: randomUUID(),
    type: element.type as ProcessMap['elements'][number]['type'],
    name: element.name,
    position: snapped,
    size: element.size ?? { width: 120, height: 80 },
    properties: element.properties ?? {},
  };

  const updatedProcess: ProcessMap = {
    ...process,
    elements: [...process.elements, newElement],
  };

  const updatedState: CanvasState = {
    ...canvasState,
    processes: canvasState.processes.map((p) =>
      p.id === processId ? updatedProcess : p
    ),
  };

  const operation: EditOperation = {
    id: randomUUID(),
    type: 'addElement',
    timestamp: new Date().toISOString(),
    userId,
    elementId: newElement.id,
    after: newElement as unknown as Record<string, unknown>,
  };

  return { canvasState: updatedState, operation };
}

export function removeElement(
  canvasState: CanvasState,
  processId: string,
  elementId: string,
  userId: string,
): { canvasState: CanvasState; operation: EditOperation } {
  const process = canvasState.processes.find((p) => p.id === processId);
  if (!process) {
    throw new Error(`Process ${processId} not found in canvas state`);
  }

  const element = process.elements.find((e) => e.id === elementId);
  if (!element) {
    throw new Error(`Element ${elementId} not found in process ${processId}`);
  }

  const updatedProcess: ProcessMap = {
    ...process,
    elements: process.elements.filter((e) => e.id !== elementId),
    connections: process.connections.filter(
      (c) => c.sourceId !== elementId && c.targetId !== elementId
    ),
  };

  const updatedState: CanvasState = {
    ...canvasState,
    processes: canvasState.processes.map((p) =>
      p.id === processId ? updatedProcess : p
    ),
  };

  const operation: EditOperation = {
    id: randomUUID(),
    type: 'removeElement',
    timestamp: new Date().toISOString(),
    userId,
    elementId,
    before: element as unknown as Record<string, unknown>,
  };

  return { canvasState: updatedState, operation };
}

export function modifyElement(
  canvasState: CanvasState,
  processId: string,
  elementId: string,
  updates: {
    name?: string;
    properties?: Record<string, unknown>;
    size?: { width: number; height: number };
  },
  userId: string,
): { canvasState: CanvasState; operation: EditOperation } {
  const process = canvasState.processes.find((p) => p.id === processId);
  if (!process) {
    throw new Error(`Process ${processId} not found in canvas state`);
  }

  const element = process.elements.find((e) => e.id === elementId);
  if (!element) {
    throw new Error(`Element ${elementId} not found in process ${processId}`);
  }

  const before = { ...element } as unknown as Record<string, unknown>;

  const updatedElement = {
    ...element,
    ...(updates.name !== undefined ? { name: updates.name } : {}),
    ...(updates.size !== undefined ? { size: updates.size } : {}),
    properties: {
      ...element.properties,
      ...(updates.properties ?? {}),
    },
  };

  const updatedProcess: ProcessMap = {
    ...process,
    elements: process.elements.map((e) =>
      e.id === elementId ? updatedElement : e
    ),
  };

  const updatedState: CanvasState = {
    ...canvasState,
    processes: canvasState.processes.map((p) =>
      p.id === processId ? updatedProcess : p
    ),
  };

  const operation: EditOperation = {
    id: randomUUID(),
    type: 'modifyElement',
    timestamp: new Date().toISOString(),
    userId,
    elementId,
    before,
    after: updatedElement as unknown as Record<string, unknown>,
  };

  return { canvasState: updatedState, operation };
}

export function moveElement(
  canvasState: CanvasState,
  processId: string,
  elementId: string,
  newPosition: { x: number; y: number },
  userId: string,
): { canvasState: CanvasState; operation: EditOperation } {
  const process = canvasState.processes.find((p) => p.id === processId);
  if (!process) {
    throw new Error(`Process ${processId} not found in canvas state`);
  }

  const element = process.elements.find((e) => e.id === elementId);
  if (!element) {
    throw new Error(`Element ${elementId} not found in process ${processId}`);
  }

  const snapped = snapPosition(newPosition);
  const before = { position: { ...element.position } };

  const updatedElement = {
    ...element,
    position: snapped,
  };

  const updatedProcess: ProcessMap = {
    ...process,
    elements: process.elements.map((e) =>
      e.id === elementId ? updatedElement : e
    ),
  };

  const updatedState: CanvasState = {
    ...canvasState,
    processes: canvasState.processes.map((p) =>
      p.id === processId ? updatedProcess : p
    ),
  };

  const operation: EditOperation = {
    id: randomUUID(),
    type: 'moveElement',
    timestamp: new Date().toISOString(),
    userId,
    elementId,
    before: before as unknown as Record<string, unknown>,
    after: { position: snapped } as unknown as Record<string, unknown>,
  };

  return { canvasState: updatedState, operation };
}

// ── Connection Operations ───────────────────────────────────────

export function addConnection(
  canvasState: CanvasState,
  processId: string,
  connection: {
    sourceId: string;
    targetId: string;
    type: 'sequenceFlow' | 'messageFlow';
    label?: string;
  },
  userId: string,
): { canvasState: CanvasState; operation: EditOperation } {
  const process = canvasState.processes.find((p) => p.id === processId);
  if (!process) {
    throw new Error(`Process ${processId} not found in canvas state`);
  }

  // Validate source and target elements exist
  const source = process.elements.find((e) => e.id === connection.sourceId);
  const target = process.elements.find((e) => e.id === connection.targetId);
  if (!source) {
    throw new Error(`Source element ${connection.sourceId} not found`);
  }
  if (!target) {
    throw new Error(`Target element ${connection.targetId} not found`);
  }

  const newConnection = {
    id: randomUUID(),
    ...connection,
  };

  const updatedProcess: ProcessMap = {
    ...process,
    connections: [...process.connections, newConnection],
  };

  const updatedState: CanvasState = {
    ...canvasState,
    processes: canvasState.processes.map((p) =>
      p.id === processId ? updatedProcess : p
    ),
  };

  const operation: EditOperation = {
    id: randomUUID(),
    type: 'addConnection',
    timestamp: new Date().toISOString(),
    userId,
    connectionId: newConnection.id,
    after: newConnection as unknown as Record<string, unknown>,
  };

  return { canvasState: updatedState, operation };
}

export function removeConnection(
  canvasState: CanvasState,
  processId: string,
  connectionId: string,
  userId: string,
): { canvasState: CanvasState; operation: EditOperation } {
  const process = canvasState.processes.find((p) => p.id === processId);
  if (!process) {
    throw new Error(`Process ${processId} not found in canvas state`);
  }

  const connection = process.connections.find((c) => c.id === connectionId);
  if (!connection) {
    throw new Error(`Connection ${connectionId} not found in process ${processId}`);
  }

  const updatedProcess: ProcessMap = {
    ...process,
    connections: process.connections.filter((c) => c.id !== connectionId),
  };

  const updatedState: CanvasState = {
    ...canvasState,
    processes: canvasState.processes.map((p) =>
      p.id === processId ? updatedProcess : p
    ),
  };

  const operation: EditOperation = {
    id: randomUUID(),
    type: 'removeConnection',
    timestamp: new Date().toISOString(),
    userId,
    connectionId,
    before: connection as unknown as Record<string, unknown>,
  };

  return { canvasState: updatedState, operation };
}

export function reconnectFlow(
  canvasState: CanvasState,
  processId: string,
  connectionId: string,
  newSourceId: string | undefined,
  newTargetId: string | undefined,
  userId: string,
): { canvasState: CanvasState; operation: EditOperation } {
  const process = canvasState.processes.find((p) => p.id === processId);
  if (!process) {
    throw new Error(`Process ${processId} not found in canvas state`);
  }

  const connection = process.connections.find((c) => c.id === connectionId);
  if (!connection) {
    throw new Error(`Connection ${connectionId} not found`);
  }

  const before = { ...connection };
  const updatedConnection = {
    ...connection,
    sourceId: newSourceId ?? connection.sourceId,
    targetId: newTargetId ?? connection.targetId,
  };

  // Validate new endpoints exist
  if (!process.elements.find((e) => e.id === updatedConnection.sourceId)) {
    throw new Error(`New source element ${updatedConnection.sourceId} not found`);
  }
  if (!process.elements.find((e) => e.id === updatedConnection.targetId)) {
    throw new Error(`New target element ${updatedConnection.targetId} not found`);
  }

  const updatedProcess: ProcessMap = {
    ...process,
    connections: process.connections.map((c) =>
      c.id === connectionId ? updatedConnection : c
    ),
  };

  const updatedState: CanvasState = {
    ...canvasState,
    processes: canvasState.processes.map((p) =>
      p.id === processId ? updatedProcess : p
    ),
  };

  const operation: EditOperation = {
    id: randomUUID(),
    type: 'reconnectFlow',
    timestamp: new Date().toISOString(),
    userId,
    connectionId,
    before: before as unknown as Record<string, unknown>,
    after: updatedConnection as unknown as Record<string, unknown>,
  };

  return { canvasState: updatedState, operation };
}

// ── Swimlane Operations ─────────────────────────────────────────

export function addSwimlane(
  canvasState: CanvasState,
  processId: string,
  swimlane: {
    name: string;
    position: { x: number; y: number };
    size: { width: number; height: number };
    properties?: Record<string, unknown>;
  },
  userId: string,
): { canvasState: CanvasState; operation: EditOperation } {
  const process = canvasState.processes.find((p) => p.id === processId);
  if (!process) {
    throw new Error(`Process ${processId} not found in canvas state`);
  }

  const snapped = snapPosition(swimlane.position);
  const newLane = {
    id: randomUUID(),
    type: 'lane' as const,
    name: swimlane.name,
    position: snapped,
    size: swimlane.size,
    properties: swimlane.properties ?? {},
  };

  const updatedProcess: ProcessMap = {
    ...process,
    elements: [...process.elements, newLane],
  };

  const updatedState: CanvasState = {
    ...canvasState,
    processes: canvasState.processes.map((p) =>
      p.id === processId ? updatedProcess : p
    ),
  };

  const operation: EditOperation = {
    id: randomUUID(),
    type: 'addSwimlane',
    timestamp: new Date().toISOString(),
    userId,
    elementId: newLane.id,
    after: newLane as unknown as Record<string, unknown>,
  };

  return { canvasState: updatedState, operation };
}

// ── Copy/Paste ──────────────────────────────────────────────────

export interface ClipboardData {
  elements: ProcessMap['elements'];
  connections: ProcessMap['connections'];
}

export function copyElements(
  canvasState: CanvasState,
  processId: string,
  elementIds: string[],
): ClipboardData {
  const process = canvasState.processes.find((p) => p.id === processId);
  if (!process) {
    throw new Error(`Process ${processId} not found in canvas state`);
  }

  const elements = process.elements.filter((e) => elementIds.includes(e.id));
  const elementIdSet = new Set(elementIds);

  // Include connections between selected elements
  const connections = process.connections.filter(
    (c) => elementIdSet.has(c.sourceId) && elementIdSet.has(c.targetId)
  );

  return { elements, connections };
}

export function pasteElements(
  canvasState: CanvasState,
  processId: string,
  clipboard: ClipboardData,
  offset: { x: number; y: number },
  userId: string,
): { canvasState: CanvasState; operations: EditOperation[] } {
  const process = canvasState.processes.find((p) => p.id === processId);
  if (!process) {
    throw new Error(`Process ${processId} not found in canvas state`);
  }

  // Map old IDs to new IDs
  const idMap = new Map<string, string>();
  for (const el of clipboard.elements) {
    idMap.set(el.id, randomUUID());
  }

  const newElements = clipboard.elements.map((el) => ({
    ...el,
    id: idMap.get(el.id)!,
    position: snapPosition({
      x: el.position.x + offset.x,
      y: el.position.y + offset.y,
    }),
  }));

  const newConnections = clipboard.connections.map((c) => ({
    ...c,
    id: randomUUID(),
    sourceId: idMap.get(c.sourceId) ?? c.sourceId,
    targetId: idMap.get(c.targetId) ?? c.targetId,
  }));

  const updatedProcess: ProcessMap = {
    ...process,
    elements: [...process.elements, ...newElements],
    connections: [...process.connections, ...newConnections],
  };

  const updatedState: CanvasState = {
    ...canvasState,
    processes: canvasState.processes.map((p) =>
      p.id === processId ? updatedProcess : p
    ),
  };

  const operations: EditOperation[] = [
    ...newElements.map(
      (el): EditOperation => ({
        id: randomUUID(),
        type: 'addElement',
        timestamp: new Date().toISOString(),
        userId,
        elementId: el.id,
        after: el as unknown as Record<string, unknown>,
      })
    ),
    ...newConnections.map(
      (c): EditOperation => ({
        id: randomUUID(),
        type: 'addConnection',
        timestamp: new Date().toISOString(),
        userId,
        connectionId: c.id,
        after: c as unknown as Record<string, unknown>,
      })
    ),
  ];

  return { canvasState: updatedState, operations };
}

// ── Changeset Builder ───────────────────────────────────────────

export function createChangeset(
  designId: string,
  operations: EditOperation[],
  userId: string,
): Changeset {
  return {
    id: randomUUID(),
    designId,
    operations,
    createdAt: new Date().toISOString(),
    userId,
  };
}

// ── Undo Support ────────────────────────────────────────────────

export function invertOperation(operation: EditOperation): EditOperation {
  const inverted: EditOperation = {
    ...operation,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
  };

  switch (operation.type) {
    case 'addElement':
      inverted.type = 'removeElement';
      inverted.before = operation.after;
      inverted.after = undefined;
      break;
    case 'removeElement':
      inverted.type = 'addElement';
      inverted.before = undefined;
      inverted.after = operation.before;
      break;
    case 'addConnection':
      inverted.type = 'removeConnection';
      inverted.before = operation.after;
      inverted.after = undefined;
      break;
    case 'removeConnection':
      inverted.type = 'addConnection';
      inverted.before = undefined;
      inverted.after = operation.before;
      break;
    case 'modifyElement':
    case 'moveElement':
    case 'reconnectFlow':
      inverted.before = operation.after;
      inverted.after = operation.before;
      break;
    case 'addSwimlane':
      inverted.type = 'removeSwimlane';
      inverted.before = operation.after;
      inverted.after = undefined;
      break;
    case 'removeSwimlane':
      inverted.type = 'addSwimlane';
      inverted.before = undefined;
      inverted.after = operation.before;
      break;
    default:
      inverted.before = operation.after;
      inverted.after = operation.before;
  }

  return inverted;
}
