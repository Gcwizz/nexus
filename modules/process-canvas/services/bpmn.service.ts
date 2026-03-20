import type { ProcessMap, BPMNElementType } from '@nexus/contracts/processes';
import { BPMNValidationError } from '@nexus/contracts/errors';

// ── BPMN Layout Constants ─────────────────────────────────────────

const LAYOUT = {
  SWIMLANE_HEIGHT: 150,
  SWIMLANE_PADDING: 20,
  ELEMENT_SPACING_X: 200,
  ELEMENT_SPACING_Y: 40,
  TASK_WIDTH: 120,
  TASK_HEIGHT: 60,
  GATEWAY_SIZE: 50,
  EVENT_SIZE: 36,
  START_X: 100,
  START_Y: 80,
} as const;

// ── BPMN Element Rendering Descriptors ────────────────────────────

export interface BPMNVisualElement {
  id: string;
  type: BPMNElementType;
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shape: 'rectangle' | 'diamond' | 'circle' | 'rounded-rectangle' | 'band';
  fill: string;
  stroke: string;
  strokeWidth: number;
  departmentLane?: string;
}

export interface BPMNVisualConnection {
  id: string;
  sourceId: string;
  targetId: string;
  type: 'sequenceFlow' | 'messageFlow';
  label?: string;
  waypoints: Array<{ x: number; y: number }>;
  stroke: string;
  strokeWidth: number;
  dashArray?: string;
  isHandoff: boolean;
}

export interface BPMNLayout {
  elements: BPMNVisualElement[];
  connections: BPMNVisualConnection[];
  swimlanes: Array<{
    id: string;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fill: string;
  }>;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

// ── Shape Resolver ────────────────────────────────────────────────

function resolveShape(type: BPMNElementType): {
  shape: BPMNVisualElement['shape'];
  width: number;
  height: number;
  fill: string;
  stroke: string;
} {
  switch (type) {
    case 'startEvent':
      return { shape: 'circle', width: LAYOUT.EVENT_SIZE, height: LAYOUT.EVENT_SIZE, fill: '#d4edda', stroke: '#28a745' };
    case 'endEvent':
      return { shape: 'circle', width: LAYOUT.EVENT_SIZE, height: LAYOUT.EVENT_SIZE, fill: '#f8d7da', stroke: '#dc3545' };
    case 'intermediateCatchEvent':
    case 'intermediateThrowEvent':
      return { shape: 'circle', width: LAYOUT.EVENT_SIZE, height: LAYOUT.EVENT_SIZE, fill: '#fff3cd', stroke: '#ffc107' };
    case 'task':
    case 'userTask':
    case 'serviceTask':
      return { shape: 'rounded-rectangle', width: LAYOUT.TASK_WIDTH, height: LAYOUT.TASK_HEIGHT, fill: '#cce5ff', stroke: '#004085' };
    case 'subProcess':
      return { shape: 'rounded-rectangle', width: LAYOUT.TASK_WIDTH + 20, height: LAYOUT.TASK_HEIGHT + 10, fill: '#e2e3e5', stroke: '#383d41' };
    case 'exclusiveGateway':
      return { shape: 'diamond', width: LAYOUT.GATEWAY_SIZE, height: LAYOUT.GATEWAY_SIZE, fill: '#fff3cd', stroke: '#856404' };
    case 'parallelGateway':
      return { shape: 'diamond', width: LAYOUT.GATEWAY_SIZE, height: LAYOUT.GATEWAY_SIZE, fill: '#d4edda', stroke: '#155724' };
    case 'inclusiveGateway':
      return { shape: 'diamond', width: LAYOUT.GATEWAY_SIZE, height: LAYOUT.GATEWAY_SIZE, fill: '#cce5ff', stroke: '#004085' };
    case 'lane':
      return { shape: 'band', width: 1200, height: LAYOUT.SWIMLANE_HEIGHT, fill: '#f8f9fa', stroke: '#6c757d' };
    case 'pool':
      return { shape: 'band', width: 1400, height: 600, fill: '#ffffff', stroke: '#343a40' };
    case 'dataObject':
      return { shape: 'rectangle', width: 40, height: 50, fill: '#ffffff', stroke: '#6c757d' };
    case 'annotation':
      return { shape: 'rectangle', width: 120, height: 40, fill: '#fffde7', stroke: '#f9a825' };
    default:
      return { shape: 'rectangle', width: LAYOUT.TASK_WIDTH, height: LAYOUT.TASK_HEIGHT, fill: '#ffffff', stroke: '#000000' };
  }
}

// ── Auto-Layout Algorithm ─────────────────────────────────────────

/**
 * Convert ProcessMap data to visual BPMN elements with auto-layout.
 *
 * Layout strategy:
 *   - Swimlanes arranged vertically (one per department)
 *   - Flow direction: left to right
 *   - Gateways centered vertically within their lane
 *   - Start events at left edge, end events at right edge
 */
export function layoutProcessMap(processMap: ProcessMap): BPMNLayout {
  const elements: BPMNVisualElement[] = [];
  const connections: BPMNVisualConnection[] = [];
  const swimlanes: BPMNLayout['swimlanes'] = [];

  // Collect department lanes
  const departments = new Set<string>();
  for (const el of processMap.elements) {
    if (el.type === 'lane' && el.name) {
      departments.add(el.name);
    }
  }

  // If no explicit lanes, infer from department field
  if (departments.size === 0 && processMap.department) {
    departments.add(processMap.department);
  }

  // Build department → lane index mapping
  const deptArray = Array.from(departments);
  const deptIndex = new Map<string, number>();
  deptArray.forEach((dept, i) => deptIndex.set(dept, i));

  // Create swimlane visuals
  const LANE_COLORS = ['#f0f4ff', '#f0fff4', '#fff8f0', '#f8f0ff', '#fff0f0', '#f0ffff'];
  let totalWidth = 1200;

  for (let i = 0; i < deptArray.length; i++) {
    swimlanes.push({
      id: `lane-${i}`,
      name: deptArray[i],
      x: 0,
      y: i * LAYOUT.SWIMLANE_HEIGHT,
      width: totalWidth,
      height: LAYOUT.SWIMLANE_HEIGHT,
      fill: LANE_COLORS[i % LANE_COLORS.length],
    });
  }

  // Topological sort for left-to-right positioning
  const elementById = new Map(processMap.elements.map((el) => [el.id, el]));
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();

  for (const conn of processMap.connections) {
    if (!outgoing.has(conn.sourceId)) outgoing.set(conn.sourceId, []);
    outgoing.get(conn.sourceId)!.push(conn.targetId);
    if (!incoming.has(conn.targetId)) incoming.set(conn.targetId, []);
    incoming.get(conn.targetId)!.push(conn.sourceId);
  }

  // Assign column positions via BFS from start events
  const columnMap = new Map<string, number>();
  const startEvents = processMap.elements.filter(
    (el) => el.type === 'startEvent' || (!incoming.has(el.id) && el.type !== 'lane' && el.type !== 'pool'),
  );

  const queue: Array<{ id: string; col: number }> = startEvents.map((el) => ({ id: el.id, col: 0 }));
  const visited = new Set<string>();

  while (queue.length > 0) {
    const { id, col } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const existing = columnMap.get(id) ?? -1;
    columnMap.set(id, Math.max(existing, col));

    const targets = outgoing.get(id) ?? [];
    for (const targetId of targets) {
      if (!visited.has(targetId)) {
        queue.push({ id: targetId, col: col + 1 });
      }
    }
  }

  // Position elements that were not reachable from start events
  for (const el of processMap.elements) {
    if (!columnMap.has(el.id) && el.type !== 'lane' && el.type !== 'pool') {
      columnMap.set(el.id, 0);
    }
  }

  // Track elements per column per lane to avoid vertical overlap
  const colLaneCount = new Map<string, number>();

  for (const el of processMap.elements) {
    if (el.type === 'lane' || el.type === 'pool') continue;

    const shapeInfo = resolveShape(el.type);
    const col = columnMap.get(el.id) ?? 0;

    // Determine lane
    const dept = el.properties?.department as string | undefined;
    const laneIdx = dept ? (deptIndex.get(dept) ?? 0) : 0;

    const colLaneKey = `${col}-${laneIdx}`;
    const rowInLane = colLaneCount.get(colLaneKey) ?? 0;
    colLaneCount.set(colLaneKey, rowInLane + 1);

    const x = LAYOUT.START_X + col * LAYOUT.ELEMENT_SPACING_X;
    const y = laneIdx * LAYOUT.SWIMLANE_HEIGHT + LAYOUT.SWIMLANE_PADDING + rowInLane * (shapeInfo.height + LAYOUT.ELEMENT_SPACING_Y);

    elements.push({
      id: el.id,
      type: el.type,
      name: el.name,
      x,
      y,
      width: shapeInfo.width,
      height: shapeInfo.height,
      shape: shapeInfo.shape,
      fill: shapeInfo.fill,
      stroke: shapeInfo.stroke,
      strokeWidth: 2,
      departmentLane: dept,
    });
  }

  // Update total width based on element positions
  const maxCol = Math.max(0, ...Array.from(columnMap.values()));
  totalWidth = Math.max(totalWidth, LAYOUT.START_X + (maxCol + 1) * LAYOUT.ELEMENT_SPACING_X + 100);

  for (const lane of swimlanes) {
    lane.width = totalWidth;
  }

  // Build visual element lookup for connection waypoints
  const visualById = new Map(elements.map((el) => [el.id, el]));

  // Build handoff lookup
  const handoffSet = new Set(processMap.crossDeptHandoffs.map((h) => h.connectionId));

  for (const conn of processMap.connections) {
    const source = visualById.get(conn.sourceId);
    const target = visualById.get(conn.targetId);
    if (!source || !target) continue;

    const isHandoff = handoffSet.has(conn.id);

    const srcCenterX = source.x + source.width / 2;
    const srcCenterY = source.y + source.height / 2;
    const tgtCenterX = target.x + target.width / 2;
    const tgtCenterY = target.y + target.height / 2;

    // Simple waypoints: source right edge -> target left edge
    const waypoints = [
      { x: source.x + source.width, y: srcCenterY },
      { x: target.x, y: tgtCenterY },
    ];

    // If cross-lane, add intermediate points for cleaner routing
    if (Math.abs(srcCenterY - tgtCenterY) > LAYOUT.SWIMLANE_HEIGHT / 2) {
      const midX = (source.x + source.width + target.x) / 2;
      waypoints.splice(1, 0, { x: midX, y: srcCenterY }, { x: midX, y: tgtCenterY });
    }

    connections.push({
      id: conn.id,
      sourceId: conn.sourceId,
      targetId: conn.targetId,
      type: conn.type,
      label: conn.label,
      waypoints,
      stroke: isHandoff ? '#e65100' : (conn.type === 'messageFlow' ? '#1565c0' : '#333333'),
      strokeWidth: isHandoff ? 3 : 2,
      dashArray: conn.type === 'messageFlow' ? '8,4' : undefined,
      isHandoff,
    });
  }

  // Compute bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + el.width);
    maxY = Math.max(maxY, el.y + el.height);
  }
  for (const lane of swimlanes) {
    minX = Math.min(minX, lane.x);
    minY = Math.min(minY, lane.y);
    maxX = Math.max(maxX, lane.x + lane.width);
    maxY = Math.max(maxY, lane.y + lane.height);
  }

  if (!isFinite(minX)) {
    minX = 0; minY = 0; maxX = 800; maxY = 600;
  }

  return { elements, connections, swimlanes, bounds: { minX, minY, maxX, maxY } };
}

// ── BPMN Validation ───────────────────────────────────────────────

export interface BPMNValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate BPMN structural rules:
 * - Every start event must have a path to an end event
 * - Gateways must have correct in/out flow counts
 * - No disconnected elements (excluding annotations/data objects)
 */
export function validateBPMN(processMap: ProcessMap): BPMNValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const flowElements = processMap.elements.filter(
    (el) => !['lane', 'pool', 'annotation', 'dataObject'].includes(el.type),
  );

  if (flowElements.length === 0) {
    return { valid: true, errors: [], warnings: ['Process has no flow elements'] };
  }

  const startEvents = flowElements.filter((el) => el.type === 'startEvent');
  const endEvents = flowElements.filter((el) => el.type === 'endEvent');

  // Must have at least one start and one end event
  if (startEvents.length === 0) {
    errors.push('Process must have at least one start event');
  }
  if (endEvents.length === 0) {
    errors.push('Process must have at least one end event');
  }

  // Build adjacency for reachability
  const outgoing = new Map<string, string[]>();
  for (const conn of processMap.connections) {
    if (!outgoing.has(conn.sourceId)) outgoing.set(conn.sourceId, []);
    outgoing.get(conn.sourceId)!.push(conn.targetId);
  }

  // Check every start event can reach an end event
  const endEventIds = new Set(endEvents.map((e) => e.id));

  for (const start of startEvents) {
    if (!canReach(start.id, endEventIds, outgoing)) {
      errors.push(`Start event "${start.name ?? start.id}" has no path to any end event`);
    }
  }

  // Check gateway flow counts
  const incomingCount = new Map<string, number>();
  const outgoingCount = new Map<string, number>();

  for (const conn of processMap.connections) {
    incomingCount.set(conn.targetId, (incomingCount.get(conn.targetId) ?? 0) + 1);
    outgoingCount.set(conn.sourceId, (outgoingCount.get(conn.sourceId) ?? 0) + 1);
  }

  for (const el of flowElements) {
    if (el.type === 'exclusiveGateway' || el.type === 'inclusiveGateway') {
      const inCount = incomingCount.get(el.id) ?? 0;
      const outCount = outgoingCount.get(el.id) ?? 0;

      // Splitting gateway: 1 in, 2+ out
      // Merging gateway: 2+ in, 1 out
      const isSplit = inCount <= 1 && outCount >= 2;
      const isMerge = inCount >= 2 && outCount <= 1;

      if (!isSplit && !isMerge) {
        warnings.push(
          `Gateway "${el.name ?? el.id}" has ${inCount} incoming and ${outCount} outgoing flows — expected split (1 in, 2+ out) or merge (2+ in, 1 out)`,
        );
      }
    }

    if (el.type === 'parallelGateway') {
      const outCount = outgoingCount.get(el.id) ?? 0;
      if (outCount < 2 && (incomingCount.get(el.id) ?? 0) < 2) {
        warnings.push(
          `Parallel gateway "${el.name ?? el.id}" should have at least 2 branches either splitting or joining`,
        );
      }
    }
  }

  // Check for disconnected elements
  const connected = new Set<string>();
  for (const conn of processMap.connections) {
    connected.add(conn.sourceId);
    connected.add(conn.targetId);
  }

  for (const el of flowElements) {
    if (!connected.has(el.id) && el.type !== 'startEvent') {
      warnings.push(`Element "${el.name ?? el.id}" (${el.type}) is not connected to any flow`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function canReach(startId: string, targets: Set<string>, outgoing: Map<string, string[]>): boolean {
  const visited = new Set<string>();
  const stack = [startId];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (targets.has(current)) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    const neighbors = outgoing.get(current) ?? [];
    for (const neighbor of neighbors) {
      stack.push(neighbor);
    }
  }

  return false;
}

// ── BPMN XML Export ───────────────────────────────────────────────

/**
 * Export a ProcessMap to BPMN 2.0 XML format.
 */
export function exportToBPMNXML(processMap: ProcessMap): string {
  const elements = processMap.elements;
  const connections = processMap.connections;

  const indent = (level: number) => '  '.repeat(level);

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"');
  lines.push('                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"');
  lines.push('                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"');
  lines.push('                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"');
  lines.push(`                  id="Definitions_${processMap.id}">`);

  // Process element
  lines.push(`${indent(1)}<bpmn:process id="Process_${processMap.id}" name="${escapeXml(processMap.name)}" isExecutable="false">`);

  // Lanes (swimlanes)
  const laneElements = elements.filter((el) => el.type === 'lane');
  if (laneElements.length > 0) {
    lines.push(`${indent(2)}<bpmn:laneSet id="LaneSet_${processMap.id}">`);
    for (const lane of laneElements) {
      lines.push(`${indent(3)}<bpmn:lane id="${lane.id}" name="${escapeXml(lane.name ?? '')}">`);
      // Assign flow elements to lanes
      const laneElems = elements.filter(
        (el) => el.properties?.department === lane.name && el.type !== 'lane' && el.type !== 'pool',
      );
      for (const laneEl of laneElems) {
        lines.push(`${indent(4)}<bpmn:flowNodeRef>${laneEl.id}</bpmn:flowNodeRef>`);
      }
      lines.push(`${indent(3)}</bpmn:lane>`);
    }
    lines.push(`${indent(2)}</bpmn:laneSet>`);
  }

  // Flow nodes
  for (const el of elements) {
    if (el.type === 'lane' || el.type === 'pool') continue;

    const bpmnTag = getBPMNTag(el.type);
    const nameAttr = el.name ? ` name="${escapeXml(el.name)}"` : '';
    lines.push(`${indent(2)}<bpmn:${bpmnTag} id="${el.id}"${nameAttr} />`);
  }

  // Sequence/message flows
  for (const conn of connections) {
    const tag = conn.type === 'messageFlow' ? 'messageFlow' : 'sequenceFlow';
    const labelAttr = conn.label ? ` name="${escapeXml(conn.label)}"` : '';
    lines.push(`${indent(2)}<bpmn:${tag} id="${conn.id}" sourceRef="${conn.sourceId}" targetRef="${conn.targetId}"${labelAttr} />`);
  }

  lines.push(`${indent(1)}</bpmn:process>`);

  // Diagram
  lines.push(`${indent(1)}<bpmndi:BPMNDiagram id="BPMNDiagram_${processMap.id}">`);
  lines.push(`${indent(2)}<bpmndi:BPMNPlane id="BPMNPlane_${processMap.id}" bpmnElement="Process_${processMap.id}">`);

  for (const el of elements) {
    if (el.type === 'sequenceFlow' || el.type === 'messageFlow') continue;
    const pos = el.position;
    const size = el.size ?? { width: LAYOUT.TASK_WIDTH, height: LAYOUT.TASK_HEIGHT };
    lines.push(`${indent(3)}<bpmndi:BPMNShape id="${el.id}_di" bpmnElement="${el.id}">`);
    lines.push(`${indent(4)}<dc:Bounds x="${pos.x}" y="${pos.y}" width="${size.width}" height="${size.height}" />`);
    lines.push(`${indent(3)}</bpmndi:BPMNShape>`);
  }

  for (const conn of connections) {
    lines.push(`${indent(3)}<bpmndi:BPMNEdge id="${conn.id}_di" bpmnElement="${conn.id}">`);
    // Use stored element positions for waypoints
    const srcEl = elements.find((e) => e.id === conn.sourceId);
    const tgtEl = elements.find((e) => e.id === conn.targetId);
    if (srcEl && tgtEl) {
      const srcSize = srcEl.size ?? { width: LAYOUT.TASK_WIDTH, height: LAYOUT.TASK_HEIGHT };
      const tgtSize = tgtEl.size ?? { width: LAYOUT.TASK_WIDTH, height: LAYOUT.TASK_HEIGHT };
      lines.push(`${indent(4)}<di:waypoint x="${srcEl.position.x + srcSize.width}" y="${srcEl.position.y + srcSize.height / 2}" />`);
      lines.push(`${indent(4)}<di:waypoint x="${tgtEl.position.x}" y="${tgtEl.position.y + tgtSize.height / 2}" />`);
    }
    lines.push(`${indent(3)}</bpmndi:BPMNEdge>`);
  }

  lines.push(`${indent(2)}</bpmndi:BPMNPlane>`);
  lines.push(`${indent(1)}</bpmndi:BPMNDiagram>`);
  lines.push('</bpmn:definitions>');

  return lines.join('\n');
}

function getBPMNTag(type: string): string {
  const tagMap: Record<string, string> = {
    startEvent: 'startEvent',
    endEvent: 'endEvent',
    task: 'task',
    userTask: 'userTask',
    serviceTask: 'serviceTask',
    exclusiveGateway: 'exclusiveGateway',
    parallelGateway: 'parallelGateway',
    inclusiveGateway: 'inclusiveGateway',
    intermediateCatchEvent: 'intermediateCatchEvent',
    intermediateThrowEvent: 'intermediateThrowEvent',
    subProcess: 'subProcess',
    dataObject: 'dataObject',
    annotation: 'textAnnotation',
  };
  return tagMap[type] ?? 'task';
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
