import { z } from 'zod';
import { llmCall } from '@nexus/llm';
import { graph } from '@nexus/graph';
import type { OntologyNode, OntologyRelationship } from '@nexus/contracts/ontology';
import { ProcessMap, type ProcessLevel } from '@nexus/contracts/processes';
import { UnmappedProcessError, BPMNValidationError } from '@nexus/contracts/errors';

// ── APQC PCF Reference Categories ─────────────────────────────────

export const APQC_CATEGORIES = [
  { id: 'apqc-1', code: '1.0', name: 'Develop Vision and Strategy' },
  { id: 'apqc-2', code: '2.0', name: 'Develop and Manage Products and Services' },
  { id: 'apqc-3', code: '3.0', name: 'Market and Sell Products and Services' },
  { id: 'apqc-4', code: '4.0', name: 'Deliver Products and Services' },
  { id: 'apqc-5', code: '5.0', name: 'Manage Customer Service' },
  { id: 'apqc-6', code: '6.0', name: 'Develop and Manage Human Capital' },
  { id: 'apqc-7', code: '7.0', name: 'Manage Information Technology' },
  { id: 'apqc-8', code: '8.0', name: 'Manage Financial Resources' },
  { id: 'apqc-9', code: '9.0', name: 'Acquire, Construct, and Manage Assets' },
  { id: 'apqc-10', code: '10.0', name: 'Manage Enterprise Risk, Compliance, Remediation, and Resiliency' },
  { id: 'apqc-11', code: '11.0', name: 'Manage External Relationships' },
  { id: 'apqc-12', code: '12.0', name: 'Develop and Manage Business Capabilities' },
  { id: 'apqc-13', code: '13.0', name: 'Manage Knowledge, Improvement, and Change' },
] as const;

export type APQCCategory = (typeof APQC_CATEGORIES)[number];

// ── LLM Input/Output Schemas ──────────────────────────────────────

const Stage1InputSchema = z.object({
  categories: z.array(z.object({ id: z.string(), code: z.string(), name: z.string() })),
  entities: z.array(z.object({
    id: z.string(),
    name: z.string(),
    entityType: z.string(),
    department: z.string().optional(),
    description: z.string().optional(),
  })),
  relationships: z.array(z.object({
    type: z.string(),
    sourceNodeId: z.string(),
    targetNodeId: z.string(),
  })),
});

const Stage1OutputSchema = z.object({
  valueChain: z.array(z.object({
    id: z.string(),
    name: z.string(),
    apqcCode: z.string(),
    description: z.string(),
    department: z.string().optional(),
  })),
  processGroups: z.array(z.object({
    id: z.string(),
    parentId: z.string(),
    name: z.string(),
    description: z.string(),
    department: z.string().optional(),
    entityIds: z.array(z.string()),
  })),
});

const Stage2InputSchema = z.object({
  processGroups: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    department: z.string().optional(),
    entityIds: z.array(z.string()),
  })),
  entities: z.array(z.object({
    id: z.string(),
    name: z.string(),
    entityType: z.string(),
    department: z.string().optional(),
    description: z.string().optional(),
  })),
  relationships: z.array(z.object({
    type: z.string(),
    sourceNodeId: z.string(),
    targetNodeId: z.string(),
  })),
});

const BPMNElementSchema = z.object({
  id: z.string(),
  type: z.enum([
    'startEvent', 'endEvent', 'task', 'userTask', 'serviceTask',
    'exclusiveGateway', 'parallelGateway', 'inclusiveGateway',
    'intermediateCatchEvent', 'intermediateThrowEvent', 'subProcess',
    'lane', 'pool', 'sequenceFlow', 'messageFlow', 'dataObject', 'annotation',
  ]),
  name: z.string().optional(),
  position: z.object({ x: z.number(), y: z.number() }),
  size: z.object({ width: z.number(), height: z.number() }).optional(),
  properties: z.record(z.unknown()),
});

const ConnectionSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  targetId: z.string(),
  type: z.enum(['sequenceFlow', 'messageFlow']),
  label: z.string().optional(),
});

const Stage2OutputSchema = z.object({
  processes: z.array(z.object({
    id: z.string(),
    parentId: z.string(),
    name: z.string(),
    description: z.string(),
    level: z.number().min(2).max(3),
    department: z.string().optional(),
    elements: z.array(BPMNElementSchema),
    connections: z.array(ConnectionSchema),
    crossDeptHandoffs: z.array(z.object({
      connectionId: z.string(),
      fromDept: z.string(),
      toDept: z.string(),
    })),
  })),
});

const Stage3InputSchema = z.object({
  level2and3: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    department: z.string().optional(),
    elements: z.array(BPMNElementSchema),
    connections: z.array(ConnectionSchema),
  })),
});

const Stage3OutputSchema = z.object({
  tasks: z.array(z.object({
    id: z.string(),
    parentId: z.string(),
    name: z.string(),
    description: z.string(),
    department: z.string().optional(),
    elements: z.array(BPMNElementSchema),
    connections: z.array(ConnectionSchema),
    crossDeptHandoffs: z.array(z.object({
      connectionId: z.string(),
      fromDept: z.string(),
      toDept: z.string(),
    })),
    estimatedDuration: z.string().optional(),
    frequency: z.string().optional(),
    involvedRoles: z.array(z.string()).optional(),
  })),
});

// ── Generation Service ────────────────────────────────────────────

export interface GenerationResult {
  canvasId: string;
  processes: ProcessMap[];
  processCounts: {
    level0: number;
    level1: number;
    level2: number;
    level3: number;
    level4: number;
  };
}

/**
 * Multi-stage LLM pipeline for generating process maps from ontology data.
 *
 * Stage 1 (Sonnet): Map ontology entities to APQC categories -> L0-L1 maps
 * Stage 2 (Opus): Generate detailed L2-L3 processes with BPMN elements
 * Stage 3 (Opus): Infer L4 task details and cross-department handoffs
 */
export async function generateProcessMaps(orgId: string): Promise<GenerationResult> {
  // Read the validated ontology from Neo4j
  const ontology = await graph.ontology.read(orgId, { depth: 3 });

  if (ontology.nodes.length === 0) {
    throw new UnmappedProcessError(
      `No ontology entities found for org ${orgId}. Cannot generate process maps without a validated ontology.`,
      { orgId },
    );
  }

  const canvasId = `canvas-${orgId}-${Date.now()}`;

  // Stage 1: Map to APQC L0-L1
  const stage1Result = await runStage1(orgId, ontology.nodes, ontology.relationships);

  // Stage 2: Generate L2-L3 with BPMN
  const stage2Result = await runStage2(orgId, stage1Result, ontology.nodes, ontology.relationships);

  // Stage 3: Infer L4 task details
  const stage3Result = await runStage3(orgId, stage2Result);

  // Build complete ProcessMap objects
  const allProcesses: ProcessMap[] = [];

  // L0 value chain items
  for (const vc of stage1Result.valueChain) {
    allProcesses.push({
      id: vc.id,
      orgId,
      name: vc.name,
      description: vc.description,
      level: 0,
      parentId: undefined,
      department: vc.department,
      elements: [{
        id: `${vc.id}-block`,
        type: 'subProcess',
        name: vc.name,
        position: { x: 0, y: 0 },
        size: { width: 200, height: 80 },
        properties: { apqcCode: vc.apqcCode },
      }],
      connections: [],
      crossDeptHandoffs: [],
      metadata: {
        generatedAt: new Date().toISOString(),
        confidence: 0.85,
        validated: false,
      },
    });
  }

  // L1 process groups
  for (const pg of stage1Result.processGroups) {
    allProcesses.push({
      id: pg.id,
      orgId,
      name: pg.name,
      description: pg.description,
      level: 1,
      parentId: pg.parentId,
      department: pg.department,
      elements: [{
        id: `${pg.id}-block`,
        type: 'subProcess',
        name: pg.name,
        position: { x: 0, y: 0 },
        size: { width: 180, height: 60 },
        properties: { entityIds: pg.entityIds },
      }],
      connections: [],
      crossDeptHandoffs: [],
      metadata: {
        generatedAt: new Date().toISOString(),
        confidence: 0.8,
        validated: false,
      },
    });
  }

  // L2-L3 processes
  for (const proc of stage2Result) {
    allProcesses.push({
      id: proc.id,
      orgId,
      name: proc.name,
      description: proc.description,
      level: proc.level as 2 | 3,
      parentId: proc.parentId,
      department: proc.department,
      elements: proc.elements,
      connections: proc.connections,
      crossDeptHandoffs: proc.crossDeptHandoffs,
      metadata: {
        generatedAt: new Date().toISOString(),
        confidence: 0.75,
        validated: false,
      },
    });
  }

  // L4 tasks
  for (const task of stage3Result) {
    allProcesses.push({
      id: task.id,
      orgId,
      name: task.name,
      description: task.description,
      level: 4,
      parentId: task.parentId,
      department: task.department,
      elements: task.elements,
      connections: task.connections,
      crossDeptHandoffs: task.crossDeptHandoffs,
      metadata: {
        generatedAt: new Date().toISOString(),
        confidence: 0.65,
        validated: false,
      },
    });
  }

  // Persist to Neo4j — Module 4 owns the processes graph domain
  await graph.processes.write(orgId, allProcesses);

  const processCounts = {
    level0: stage1Result.valueChain.length,
    level1: stage1Result.processGroups.length,
    level2: stage2Result.filter((p) => p.level === 2).length,
    level3: stage2Result.filter((p) => p.level === 3).length,
    level4: stage3Result.length,
  };

  return { canvasId, processes: allProcesses, processCounts };
}

// ── Stage 1: Ontology → APQC L0/L1 ────────────────────────────────

async function runStage1(
  orgId: string,
  nodes: OntologyNode[],
  relationships: OntologyRelationship[],
) {
  const input = {
    categories: APQC_CATEGORIES.map((c) => ({ id: c.id, code: c.code, name: c.name })),
    entities: nodes.map((n) => ({
      id: n.id,
      name: n.name,
      entityType: n.entityType,
      department: n.department,
      description: n.description,
    })),
    relationships: relationships.map((r) => ({
      type: r.type,
      sourceNodeId: r.sourceNodeId,
      targetNodeId: r.targetNodeId,
    })),
  };

  const result = await llmCall({
    model: 'sonnet',
    systemPrompt: `You are a business process analyst specialising in the APQC Process Classification Framework (PCF).

Given an organisation's ontology entities and relationships, map them to APQC categories and generate:
1. Level 0 (Value Chain): Top-level APQC categories that apply to this organisation
2. Level 1 (Process Groups): Subdivisions within each applicable category

Only include APQC categories where the organisation has clear evidence of activity based on the entities provided.
Each process group should reference the entity IDs it relates to.

Return valid JSON matching the output schema. Use unique IDs prefixed with "l0-" for value chain and "l1-" for process groups.`,
    inputSchema: Stage1InputSchema,
    outputSchema: Stage1OutputSchema,
    sanitise: true,
    orgId,
  }, input);

  if (result.data.valueChain.length === 0) {
    throw new UnmappedProcessError(
      'Stage 1 generation produced zero value chain items. The ontology may lack sufficient process-related entities.',
      { orgId },
    );
  }

  return result.data;
}

// ── Stage 2: L1 → L2/L3 with BPMN ─────────────────────────────────

async function runStage2(
  orgId: string,
  stage1: z.infer<typeof Stage1OutputSchema>,
  nodes: OntologyNode[],
  relationships: OntologyRelationship[],
) {
  const input = {
    processGroups: stage1.processGroups.map((pg) => ({
      id: pg.id,
      name: pg.name,
      description: pg.description,
      department: pg.department,
      entityIds: pg.entityIds,
    })),
    entities: nodes.map((n) => ({
      id: n.id,
      name: n.name,
      entityType: n.entityType,
      department: n.department,
      description: n.description,
    })),
    relationships: relationships.map((r) => ({
      type: r.type,
      sourceNodeId: r.sourceNodeId,
      targetNodeId: r.targetNodeId,
    })),
  };

  const result = await llmCall({
    model: 'opus',
    systemPrompt: `You are an expert BPMN 2.0 process modeller. Generate detailed Level 2 (Process) and Level 3 (Activity) definitions with proper BPMN elements.

For each process group provided, create:
- Level 2 processes: High-level workflows with start events, end events, tasks, and gateways
- Level 3 activities: Detailed activity breakdowns within each L2 process

BPMN rules:
- Every process must have exactly one start event and at least one end event
- Every start event must have a path to an end event via sequence flows
- Exclusive gateways must have one incoming and 2+ outgoing flows (or vice versa for merging)
- Parallel gateways must have matching split/join pairs
- Swimlanes represent departments — assign each task to a department
- Cross-department handoffs must be identified with messageFlow connections

Layout rules:
- Flow direction: left to right
- Swimlanes arranged vertically (one per department)
- Position elements with x starting at 100, incrementing by 200 for each step
- Swimlane height: 150px per lane, y offset by lane index * 150

Use unique IDs prefixed with "l2-" for processes and "l3-" for activities.
Return valid JSON matching the output schema.`,
    inputSchema: Stage2InputSchema,
    outputSchema: Stage2OutputSchema,
    sanitise: true,
    orgId,
  }, input);

  return result.data.processes;
}

// ── Stage 3: L2/L3 → L4 Tasks ──────────────────────────────────────

async function runStage3(
  orgId: string,
  level2and3: Array<{
    id: string;
    name: string;
    description: string;
    department?: string;
    elements: z.infer<typeof BPMNElementSchema>[];
    connections: z.infer<typeof ConnectionSchema>[];
  }>,
) {
  const input = {
    level2and3: level2and3.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      department: p.department,
      elements: p.elements,
      connections: p.connections,
    })),
  };

  const result = await llmCall({
    model: 'opus',
    systemPrompt: `You are a detailed process analyst. For each Level 2/3 process provided, generate Level 4 task breakdowns.

Level 4 tasks are the most granular process steps — individual actions performed by a specific person or system.

For each task, provide:
- Detailed BPMN elements (userTask for human actions, serviceTask for automated steps)
- Sequence flows connecting all elements
- Cross-department handoffs where a task output feeds into another department's input
- Estimated duration (e.g., "15 minutes", "2 hours")
- Frequency (e.g., "daily", "weekly", "per transaction")
- Involved roles

Use unique IDs prefixed with "l4-". Return valid JSON matching the output schema.`,
    inputSchema: Stage3InputSchema,
    outputSchema: Stage3OutputSchema,
    sanitise: true,
    orgId,
  }, input);

  return result.data.tasks;
}
