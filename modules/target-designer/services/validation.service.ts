import { randomUUID } from 'crypto';
import type { CanvasState, ProcessMap, BPMNElementType } from '@nexus/contracts/processes';
import { SemanticValidationError } from '@nexus/contracts/errors';
import type { ValidationResult, ValidationIssue, ValidationSeverity } from '../types';

// ── Semantic Validation ─────────────────────────────────────────

/**
 * Run all semantic validation rules against a canvas state.
 * Returns errors, warnings, and info-level issues with element IDs
 * and fix suggestions.
 */
export function validate(canvasState: CanvasState): ValidationResult {
  const issues: ValidationIssue[] = [];

  for (const process of canvasState.processes) {
    issues.push(...validateOrphanedEntities(process));
    issues.push(...validateDataFlows(process));
    issues.push(...validateCircularDependencies(process));
    issues.push(...validateGateways(process));
    issues.push(...validateStartEndEvents(process));
    issues.push(...validateConnections(process));
  }

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const infoCount = issues.filter((i) => i.severity === 'info').length;

  return {
    valid: errorCount === 0,
    issues,
    errorCount,
    warningCount,
    infoCount,
    validatedAt: new Date().toISOString(),
  };
}

/**
 * Validate and throw SemanticValidationError if validation fails.
 */
export function validateOrThrow(canvasState: CanvasState, orgId?: string): ValidationResult {
  const result = validate(canvasState);
  if (!result.valid) {
    throw new SemanticValidationError(
      `Semantic validation failed with ${result.errorCount} error(s): ${result.issues
        .filter((i) => i.severity === 'error')
        .map((i) => i.message)
        .join('; ')}`,
      { orgId },
    );
  }
  return result;
}

// ── Rule: No Orphaned Entities ──────────────────────────────────
//
// Every element must be reachable from a start event.

function validateOrphanedEntities(process: ProcessMap): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const startEvents = process.elements.filter(
    (e) => e.type === 'startEvent'
  );

  if (startEvents.length === 0) {
    // If no start events, skip orphan check (separate rule)
    return issues;
  }

  // Build adjacency from connections (forward-only)
  const adjacency = new Map<string, Set<string>>();
  for (const conn of process.connections) {
    if (!adjacency.has(conn.sourceId)) {
      adjacency.set(conn.sourceId, new Set());
    }
    adjacency.get(conn.sourceId)!.add(conn.targetId);
  }

  // BFS from all start events
  const reachable = new Set<string>();
  const queue: string[] = startEvents.map((e) => e.id);
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (reachable.has(current)) continue;
    reachable.add(current);

    const neighbours = adjacency.get(current);
    if (neighbours) {
      for (const n of neighbours) {
        if (!reachable.has(n)) {
          queue.push(n);
        }
      }
    }
  }

  // Non-structural elements that should be reachable
  const checkableTypes = new Set<string>([
    'task', 'userTask', 'serviceTask', 'exclusiveGateway', 'parallelGateway',
    'inclusiveGateway', 'intermediateCatchEvent', 'intermediateThrowEvent',
    'subProcess', 'endEvent',
  ]);

  for (const element of process.elements) {
    if (!checkableTypes.has(element.type)) continue;
    if (!reachable.has(element.id)) {
      issues.push({
        id: randomUUID(),
        elementId: element.id,
        elementName: element.name,
        severity: 'error',
        code: 'ORPHANED_ENTITY',
        message: `Element "${element.name ?? element.id}" is not reachable from any start event`,
        suggestion: 'Connect this element to the process flow, or remove it if it is no longer needed',
      });
    }
  }

  return issues;
}

// ── Rule: No Broken Data Flows ──────────────────────────────────
//
// Every data input must have a source.

function validateDataFlows(process: ProcessMap): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const dataObjects = process.elements.filter(
    (e) => e.type === 'dataObject'
  );

  for (const dataObj of dataObjects) {
    // Check if any connection targets this data object
    const hasIncoming = process.connections.some(
      (c) => c.targetId === dataObj.id
    );
    // Check if any connection sources from this data object
    const hasOutgoing = process.connections.some(
      (c) => c.sourceId === dataObj.id
    );

    if (!hasIncoming && !hasOutgoing) {
      issues.push({
        id: randomUUID(),
        elementId: dataObj.id,
        elementName: dataObj.name,
        severity: 'error',
        code: 'DISCONNECTED_DATA_OBJECT',
        message: `Data object "${dataObj.name ?? dataObj.id}" has no connections`,
        suggestion: 'Connect this data object to at least one task that produces or consumes it',
      });
    }

    if (!hasIncoming && hasOutgoing) {
      issues.push({
        id: randomUUID(),
        elementId: dataObj.id,
        elementName: dataObj.name,
        severity: 'warning',
        code: 'DATA_NO_SOURCE',
        message: `Data object "${dataObj.name ?? dataObj.id}" has no source (no incoming connection)`,
        suggestion: 'Add a connection from a task or event that produces this data',
      });
    }
  }

  // Check tasks with data input properties
  for (const element of process.elements) {
    const props = element.properties as Record<string, unknown>;
    if (props.dataInputRef && typeof props.dataInputRef === 'string') {
      const inputExists = process.elements.some((e) => e.id === props.dataInputRef);
      if (!inputExists) {
        issues.push({
          id: randomUUID(),
          elementId: element.id,
          elementName: element.name,
          severity: 'error',
          code: 'BROKEN_DATA_REFERENCE',
          message: `Element "${element.name ?? element.id}" references data object "${props.dataInputRef}" which does not exist`,
          suggestion: 'Create the missing data object or update the reference',
        });
      }
    }
  }

  return issues;
}

// ── Rule: No Circular Dependencies ──────────────────────────────
//
// Detect cycles in process flows. Explicitly marked loops are allowed
// (elements with properties.isLoop = true).

function validateCircularDependencies(process: ProcessMap): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Build adjacency
  const adjacency = new Map<string, string[]>();
  for (const conn of process.connections) {
    if (conn.type !== 'sequenceFlow') continue;
    if (!adjacency.has(conn.sourceId)) {
      adjacency.set(conn.sourceId, []);
    }
    adjacency.get(conn.sourceId)!.push(conn.targetId);
  }

  // Elements marked as loop
  const loopElements = new Set(
    process.elements
      .filter((e) => (e.properties as Record<string, unknown>).isLoop === true)
      .map((e) => e.id)
  );

  // DFS cycle detection
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const cycleEdges: Array<{ from: string; to: string }> = [];

  function dfs(nodeId: string): void {
    if (inStack.has(nodeId)) {
      // Found a cycle - but only report if not a loop element
      return;
    }
    if (visited.has(nodeId)) return;

    visited.add(nodeId);
    inStack.add(nodeId);

    const neighbours = adjacency.get(nodeId) ?? [];
    for (const next of neighbours) {
      if (inStack.has(next) && !loopElements.has(nodeId) && !loopElements.has(next)) {
        cycleEdges.push({ from: nodeId, to: next });
      }
      if (!visited.has(next)) {
        dfs(next);
      }
    }

    inStack.delete(nodeId);
  }

  for (const element of process.elements) {
    if (!visited.has(element.id)) {
      dfs(element.id);
    }
  }

  for (const edge of cycleEdges) {
    const fromName = process.elements.find((e) => e.id === edge.from)?.name ?? edge.from;
    const toName = process.elements.find((e) => e.id === edge.to)?.name ?? edge.to;

    issues.push({
      id: randomUUID(),
      elementId: edge.from,
      elementName: fromName,
      severity: 'error',
      code: 'CIRCULAR_DEPENDENCY',
      message: `Circular dependency detected: "${fromName}" -> "${toName}" creates a cycle`,
      suggestion: 'Break the cycle by removing the connection, or mark the elements with isLoop=true if this is an intentional loop',
    });
  }

  return issues;
}

// ── Rule: Gateway Validation ────────────────────────────────────
//
// - Exclusive gateways need conditions on outgoing flows
// - Parallel gateways need matching join (fork/join pairs)

function validateGateways(process: ProcessMap): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const gateways = process.elements.filter(
    (e) => e.type === 'exclusiveGateway' || e.type === 'parallelGateway' || e.type === 'inclusiveGateway'
  );

  for (const gateway of gateways) {
    const outgoing = process.connections.filter((c) => c.sourceId === gateway.id);
    const incoming = process.connections.filter((c) => c.targetId === gateway.id);

    // Exclusive gateway: outgoing flows should have conditions (labels)
    if (gateway.type === 'exclusiveGateway' && outgoing.length > 1) {
      const missingConditions = outgoing.filter((c) => !c.label || c.label.trim() === '');
      if (missingConditions.length > 0) {
        issues.push({
          id: randomUUID(),
          elementId: gateway.id,
          elementName: gateway.name,
          severity: 'warning',
          code: 'GATEWAY_MISSING_CONDITIONS',
          message: `Exclusive gateway "${gateway.name ?? gateway.id}" has ${missingConditions.length} outgoing flow(s) without conditions`,
          suggestion: 'Add condition labels to all outgoing sequence flows from this exclusive gateway',
        });
      }
    }

    // Parallel gateway: check for matching join
    if (gateway.type === 'parallelGateway') {
      const isFork = outgoing.length > 1 && incoming.length <= 1;
      const isJoin = incoming.length > 1 && outgoing.length <= 1;

      if (isFork) {
        // Check that there is a matching join gateway downstream
        const hasMatchingJoin = gateways.some((g) => {
          if (g.id === gateway.id) return false;
          if (g.type !== 'parallelGateway') return false;
          const gIncoming = process.connections.filter((c) => c.targetId === g.id);
          return gIncoming.length > 1;
        });

        if (!hasMatchingJoin) {
          issues.push({
            id: randomUUID(),
            elementId: gateway.id,
            elementName: gateway.name,
            severity: 'warning',
            code: 'GATEWAY_NO_MATCHING_JOIN',
            message: `Parallel gateway fork "${gateway.name ?? gateway.id}" has no matching join gateway`,
            suggestion: 'Add a parallel gateway join to synchronise the parallel paths',
          });
        }
      }

      // Warn about single-path gateways
      if (outgoing.length <= 1 && incoming.length <= 1) {
        issues.push({
          id: randomUUID(),
          elementId: gateway.id,
          elementName: gateway.name,
          severity: 'info',
          code: 'GATEWAY_SINGLE_PATH',
          message: `Gateway "${gateway.name ?? gateway.id}" has only one incoming and one outgoing flow`,
          suggestion: 'This gateway may be unnecessary. Consider removing it to simplify the process',
        });
      }
    }

    // Any gateway without outgoing flows
    if (outgoing.length === 0) {
      issues.push({
        id: randomUUID(),
        elementId: gateway.id,
        elementName: gateway.name,
        severity: 'error',
        code: 'GATEWAY_NO_OUTGOING',
        message: `Gateway "${gateway.name ?? gateway.id}" has no outgoing flows`,
        suggestion: 'Add at least one outgoing sequence flow from this gateway',
      });
    }

    // Any gateway without incoming flows
    if (incoming.length === 0) {
      issues.push({
        id: randomUUID(),
        elementId: gateway.id,
        elementName: gateway.name,
        severity: 'error',
        code: 'GATEWAY_NO_INCOMING',
        message: `Gateway "${gateway.name ?? gateway.id}" has no incoming flows`,
        suggestion: 'Connect an incoming sequence flow to this gateway',
      });
    }
  }

  return issues;
}

// ── Rule: Start/End Event Validation ────────────────────────────

function validateStartEndEvents(process: ProcessMap): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const startEvents = process.elements.filter((e) => e.type === 'startEvent');
  const endEvents = process.elements.filter((e) => e.type === 'endEvent');

  if (startEvents.length === 0) {
    issues.push({
      id: randomUUID(),
      elementId: process.id,
      elementName: process.name,
      severity: 'error',
      code: 'NO_START_EVENT',
      message: `Process "${process.name}" has no start event`,
      suggestion: 'Add a start event to define where the process begins',
    });
  }

  if (endEvents.length === 0) {
    issues.push({
      id: randomUUID(),
      elementId: process.id,
      elementName: process.name,
      severity: 'warning',
      code: 'NO_END_EVENT',
      message: `Process "${process.name}" has no end event`,
      suggestion: 'Add at least one end event to define where the process terminates',
    });
  }

  // Start events should not have incoming flows
  for (const start of startEvents) {
    const incoming = process.connections.filter((c) => c.targetId === start.id);
    if (incoming.length > 0) {
      issues.push({
        id: randomUUID(),
        elementId: start.id,
        elementName: start.name,
        severity: 'error',
        code: 'START_HAS_INCOMING',
        message: `Start event "${start.name ?? start.id}" has ${incoming.length} incoming flow(s)`,
        suggestion: 'Remove incoming flows from the start event',
      });
    }
  }

  // End events should not have outgoing flows
  for (const end of endEvents) {
    const outgoing = process.connections.filter((c) => c.sourceId === end.id);
    if (outgoing.length > 0) {
      issues.push({
        id: randomUUID(),
        elementId: end.id,
        elementName: end.name,
        severity: 'error',
        code: 'END_HAS_OUTGOING',
        message: `End event "${end.name ?? end.id}" has ${outgoing.length} outgoing flow(s)`,
        suggestion: 'Remove outgoing flows from the end event',
      });
    }
  }

  return issues;
}

// ── Rule: Connection Validation ─────────────────────────────────

function validateConnections(process: ProcessMap): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const elementIds = new Set(process.elements.map((e) => e.id));

  for (const conn of process.connections) {
    if (!elementIds.has(conn.sourceId)) {
      issues.push({
        id: randomUUID(),
        elementId: conn.id,
        severity: 'error',
        code: 'DANGLING_SOURCE',
        message: `Connection "${conn.id}" references non-existent source element "${conn.sourceId}"`,
        suggestion: 'Remove this connection or reconnect it to an existing element',
      });
    }

    if (!elementIds.has(conn.targetId)) {
      issues.push({
        id: randomUUID(),
        elementId: conn.id,
        severity: 'error',
        code: 'DANGLING_TARGET',
        message: `Connection "${conn.id}" references non-existent target element "${conn.targetId}"`,
        suggestion: 'Remove this connection or reconnect it to an existing element',
      });
    }

    // Self-referencing connections
    if (conn.sourceId === conn.targetId) {
      issues.push({
        id: randomUUID(),
        elementId: conn.id,
        severity: 'warning',
        code: 'SELF_REFERENCE',
        message: `Connection "${conn.id}" connects element "${conn.sourceId}" to itself`,
        suggestion: 'Remove self-referencing connection unless it represents an intentional loop',
      });
    }
  }

  // Duplicate connections
  const connPairs = new Set<string>();
  for (const conn of process.connections) {
    const pair = `${conn.sourceId}->${conn.targetId}:${conn.type}`;
    if (connPairs.has(pair)) {
      issues.push({
        id: randomUUID(),
        elementId: conn.id,
        severity: 'warning',
        code: 'DUPLICATE_CONNECTION',
        message: `Duplicate connection between "${conn.sourceId}" and "${conn.targetId}"`,
        suggestion: 'Remove the duplicate connection',
      });
    }
    connPairs.add(pair);
  }

  return issues;
}
