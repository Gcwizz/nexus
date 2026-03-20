import { z } from 'zod';

// ── Process Levels (APQC PCF-aligned) ────────────────────────────

export const ProcessLevel = {
  L0_ValueChain: 0,
  L1_ProcessGroup: 1,
  L2_Process: 2,
  L3_Activity: 3,
  L4_Task: 4,
} as const;

export type ProcessLevel = (typeof ProcessLevel)[keyof typeof ProcessLevel];

// ── BPMN Elements ────────────────────────────────────────────────

export const BPMNElementType = z.enum([
  'startEvent',
  'endEvent',
  'task',
  'userTask',
  'serviceTask',
  'exclusiveGateway',
  'parallelGateway',
  'inclusiveGateway',
  'intermediateCatchEvent',
  'intermediateThrowEvent',
  'subProcess',
  'lane',
  'pool',
  'sequenceFlow',
  'messageFlow',
  'dataObject',
  'annotation',
]);

export type BPMNElementType = z.infer<typeof BPMNElementType>;

// ── Process Map ──────────────────────────────────────────────────

export const ProcessMap = z.object({
  id: z.string(),
  orgId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  level: z.number().min(0).max(4),
  parentId: z.string().optional(),
  department: z.string().optional(),
  elements: z.array(z.object({
    id: z.string(),
    type: BPMNElementType,
    name: z.string().optional(),
    position: z.object({ x: z.number(), y: z.number() }),
    size: z.object({ width: z.number(), height: z.number() }).optional(),
    properties: z.record(z.unknown()),
  })),
  connections: z.array(z.object({
    id: z.string(),
    sourceId: z.string(),
    targetId: z.string(),
    type: z.enum(['sequenceFlow', 'messageFlow']),
    label: z.string().optional(),
  })),
  crossDeptHandoffs: z.array(z.object({
    connectionId: z.string(),
    fromDept: z.string(),
    toDept: z.string(),
  })),
  metadata: z.object({
    generatedAt: z.string().datetime(),
    confidence: z.number().min(0).max(1),
    validated: z.boolean(),
  }),
});

export type ProcessMap = z.infer<typeof ProcessMap>;

// ── Canvas State ─────────────────────────────────────────────────

export const CanvasState = z.object({
  orgId: z.string(),
  canvasId: z.string(),
  viewport: z.object({
    x: z.number(),
    y: z.number(),
    zoom: z.number(),
  }),
  processes: z.array(ProcessMap),
  annotations: z.array(z.object({
    id: z.string(),
    processId: z.string(),
    elementId: z.string().optional(),
    text: z.string(),
    author: z.string(),
    createdAt: z.string().datetime(),
    type: z.enum(['comment', 'flag', 'suggestion']),
  })),
});

export type CanvasState = z.infer<typeof CanvasState>;

// ── What-If Calculation ──────────────────────────────────────────

export const WhatIfResult = z.object({
  processId: z.string(),
  elementId: z.string(),
  action: z.enum(['automate', 'remove', 'optimise', 'consolidate']),
  estimatedSavings: z.object({
    hoursPerWeek: z.number(),
    affectedPeople: z.number(),
    costPerYear: z.number().optional(),
  }),
  confidence: z.enum(['high', 'medium', 'low']),
});

export type WhatIfResult = z.infer<typeof WhatIfResult>;
