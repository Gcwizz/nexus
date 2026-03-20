import { graph } from '@nexus/graph';
import type { CanvasState, ProcessMap } from '@nexus/contracts/processes';
import type { ImpactItem, ImpactSummary, ImpactCategory, ImpactSeverity, EditOperation } from '../types';

// ── Impact Analysis ─────────────────────────────────────────────

/**
 * Analyse the impact of a set of edit operations on the process graph.
 * Traces the graph from modified elements to find all affected elements,
 * classifying them as direct (connected), indirect (downstream), or
 * cross-department.
 */
export async function analyseImpact(
  orgId: string,
  designId: string,
  canvasState: CanvasState,
  operations: EditOperation[],
): Promise<ImpactSummary> {
  const modifiedElementIds = new Set<string>();
  for (const op of operations) {
    if (op.elementId) modifiedElementIds.add(op.elementId);
    // For connection ops, add both endpoints
    if (op.connectionId) {
      const after = op.after as { sourceId?: string; targetId?: string } | undefined;
      const before = op.before as { sourceId?: string; targetId?: string } | undefined;
      if (after?.sourceId) modifiedElementIds.add(after.sourceId);
      if (after?.targetId) modifiedElementIds.add(after.targetId);
      if (before?.sourceId) modifiedElementIds.add(before.sourceId);
      if (before?.targetId) modifiedElementIds.add(before.targetId);
    }
  }

  // Build adjacency maps from canvas state
  const { adjacency, elementProcessMap, elementDeptMap, elementNameMap } =
    buildGraphMaps(canvasState);

  // Trace impact through the graph
  const items: ImpactItem[] = [];
  const visited = new Set<string>();

  for (const elementId of modifiedElementIds) {
    traceImpact(
      elementId,
      adjacency,
      elementProcessMap,
      elementDeptMap,
      elementNameMap,
      canvasState,
      modifiedElementIds,
      visited,
      items,
      0,
    );
  }

  // Enrich with Neo4j graph traversal for cross-process relationships
  const graphImpact = await traceGraphImpact(orgId, designId, modifiedElementIds);
  items.push(...graphImpact);

  // Deduplicate by elementId
  const uniqueItems = deduplicateImpactItems(items);

  const directCount = uniqueItems.filter((i) => i.category === 'direct').length;
  const indirectCount = uniqueItems.filter((i) => i.category === 'indirect').length;
  const crossDeptCount = uniqueItems.filter((i) => i.category === 'cross-department').length;

  return {
    designId,
    totalAffected: uniqueItems.length,
    directCount,
    indirectCount,
    crossDeptCount,
    items: uniqueItems,
    analysedAt: new Date().toISOString(),
  };
}

// ── Graph Map Building ──────────────────────────────────────────

interface GraphMaps {
  adjacency: Map<string, Set<string>>;
  elementProcessMap: Map<string, string>;
  elementDeptMap: Map<string, string>;
  elementNameMap: Map<string, string>;
}

function buildGraphMaps(canvasState: CanvasState): GraphMaps {
  const adjacency = new Map<string, Set<string>>();
  const elementProcessMap = new Map<string, string>();
  const elementDeptMap = new Map<string, string>();
  const elementNameMap = new Map<string, string>();

  for (const process of canvasState.processes) {
    for (const element of process.elements) {
      elementProcessMap.set(element.id, process.id);
      elementNameMap.set(element.id, element.name ?? element.id);
      if (process.department) {
        elementDeptMap.set(element.id, process.department);
      }

      if (!adjacency.has(element.id)) {
        adjacency.set(element.id, new Set());
      }
    }

    for (const conn of process.connections) {
      if (!adjacency.has(conn.sourceId)) {
        adjacency.set(conn.sourceId, new Set());
      }
      adjacency.get(conn.sourceId)!.add(conn.targetId);

      // Also track reverse for bidirectional impact analysis
      if (!adjacency.has(conn.targetId)) {
        adjacency.set(conn.targetId, new Set());
      }
      adjacency.get(conn.targetId)!.add(conn.sourceId);
    }
  }

  return { adjacency, elementProcessMap, elementDeptMap, elementNameMap };
}

// ── Graph Traversal ─────────────────────────────────────────────

function traceImpact(
  elementId: string,
  adjacency: Map<string, Set<string>>,
  elementProcessMap: Map<string, string>,
  elementDeptMap: Map<string, string>,
  elementNameMap: Map<string, string>,
  canvasState: CanvasState,
  modifiedElements: Set<string>,
  visited: Set<string>,
  items: ImpactItem[],
  depth: number,
): void {
  if (visited.has(elementId) || depth > 5) return;
  visited.add(elementId);

  const neighbours = adjacency.get(elementId);
  if (!neighbours) return;

  const sourceDept = elementDeptMap.get(elementId);
  const sourceProcessId = elementProcessMap.get(elementId);

  for (const neighbourId of neighbours) {
    if (modifiedElements.has(neighbourId)) continue;

    const neighbourDept = elementDeptMap.get(neighbourId);
    const neighbourProcessId = elementProcessMap.get(neighbourId);
    const processName = findProcessName(canvasState, neighbourProcessId);

    let category: ImpactCategory;
    let severity: ImpactSeverity;

    if (depth === 0) {
      // Directly connected
      if (sourceDept && neighbourDept && sourceDept !== neighbourDept) {
        category = 'cross-department';
        severity = 'high';
      } else {
        category = 'direct';
        severity = 'medium';
      }
    } else {
      // Indirect (downstream)
      if (sourceDept && neighbourDept && sourceDept !== neighbourDept) {
        category = 'cross-department';
        severity = 'high';
      } else {
        category = 'indirect';
        severity = depth <= 2 ? 'medium' : 'low';
      }
    }

    items.push({
      elementId: neighbourId,
      elementName: elementNameMap.get(neighbourId) ?? neighbourId,
      processId: neighbourProcessId ?? '',
      processName: processName ?? '',
      category,
      severity,
      description: buildImpactDescription(category, depth, elementNameMap.get(elementId), elementNameMap.get(neighbourId)),
      department: neighbourDept,
    });

    // Continue traversal for indirect impact
    traceImpact(
      neighbourId,
      adjacency,
      elementProcessMap,
      elementDeptMap,
      elementNameMap,
      canvasState,
      modifiedElements,
      visited,
      items,
      depth + 1,
    );
  }
}

// ── Neo4j Graph Traversal ───────────────────────────────────────

async function traceGraphImpact(
  orgId: string,
  designId: string,
  modifiedElementIds: Set<string>,
): Promise<ImpactItem[]> {
  const items: ImpactItem[] = [];

  try {
    const targetState = await graph.targetState.read(orgId, designId);
    if (!targetState) return items;

    // Read current process graph for cross-process relationships
    const processes = await graph.processes.read(orgId);
    if (!Array.isArray(processes) || processes.length === 0) return items;

    // For each modified element, check if it appears in cross-process relationships
    for (const process of processes) {
      const proc = process as { id?: string; name?: string; elements?: Array<{ id?: string; name?: string }>; department?: string };
      if (!proc.elements) continue;

      for (const element of proc.elements) {
        if (!element.id) continue;
        // Check if this element references any modified element
        const elementData = element as Record<string, unknown>;
        const refs = extractReferences(elementData);

        for (const ref of refs) {
          if (modifiedElementIds.has(ref)) {
            items.push({
              elementId: element.id,
              elementName: element.name ?? element.id,
              processId: proc.id ?? '',
              processName: proc.name ?? '',
              category: 'cross-department',
              severity: 'high',
              description: `Cross-process dependency: element "${element.name ?? element.id}" in process "${proc.name ?? ''}" references a modified element`,
              department: proc.department,
            });
          }
        }
      }
    }
  } catch {
    // If graph is unavailable, return what we have from canvas analysis
  }

  return items;
}

// ── Helpers ─────────────────────────────────────────────────────

function findProcessName(canvasState: CanvasState, processId: string | undefined): string | undefined {
  if (!processId) return undefined;
  return canvasState.processes.find((p) => p.id === processId)?.name;
}

function buildImpactDescription(
  category: ImpactCategory,
  depth: number,
  sourceName: string | undefined,
  targetName: string | undefined,
): string {
  const src = sourceName ?? 'modified element';
  const tgt = targetName ?? 'this element';

  switch (category) {
    case 'direct':
      return `"${tgt}" is directly connected to "${src}" and will be affected by the change`;
    case 'indirect':
      return `"${tgt}" is ${depth} step${depth > 1 ? 's' : ''} downstream from "${src}" and may be affected`;
    case 'cross-department':
      return `"${tgt}" is in a different department and has a dependency on "${src}"`;
  }
}

function extractReferences(data: Record<string, unknown>): string[] {
  const refs: string[] = [];
  for (const value of Object.values(data)) {
    if (typeof value === 'string' && value.match(/^[0-9a-f-]{36}$/)) {
      refs.push(value);
    }
  }
  return refs;
}

function deduplicateImpactItems(items: ImpactItem[]): ImpactItem[] {
  const seen = new Map<string, ImpactItem>();
  for (const item of items) {
    const existing = seen.get(item.elementId);
    if (!existing || severityRank(item.severity) > severityRank(existing.severity)) {
      seen.set(item.elementId, item);
    }
  }
  return Array.from(seen.values());
}

function severityRank(severity: ImpactSeverity): number {
  switch (severity) {
    case 'high': return 3;
    case 'medium': return 2;
    case 'low': return 1;
  }
}
