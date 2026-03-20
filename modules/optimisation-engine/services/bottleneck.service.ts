import { z } from 'zod';
import { llmCall } from '@nexus/llm';
import { graph } from '@nexus/graph';
import type { ProcessMap } from '@nexus/contracts/processes';
import type { OntologyNode } from '@nexus/contracts/ontology';
import {
  type BottleneckAnalysisResult,
  type BottleneckFinding,
  BottleneckFinding as BottleneckFindingSchema,
} from '../types.js';
import { AnalysisFailedError } from '../errors.js';

// ── LLM Schemas ─────────────────────────────────────────────────

const BottleneckInputSchema = z.object({
  orgId: z.string(),
  processes: z.array(z.object({
    id: z.string(),
    name: z.string(),
    department: z.string().optional(),
    level: z.number(),
    elements: z.array(z.object({
      id: z.string(),
      type: z.string(),
      name: z.string().optional(),
      properties: z.record(z.unknown()),
    })),
    connections: z.array(z.object({
      id: z.string(),
      sourceId: z.string(),
      targetId: z.string(),
      type: z.string(),
      label: z.string().optional(),
    })),
    crossDeptHandoffs: z.array(z.object({
      connectionId: z.string(),
      fromDept: z.string(),
      toDept: z.string(),
    })),
  })),
  departments: z.array(z.string()),
});

type BottleneckInput = z.infer<typeof BottleneckInputSchema>;

const BottleneckOutputSchema = z.object({
  findings: z.array(BottleneckFindingSchema),
});

// ── System Prompt ───────────────────────────────────────────────

const BOTTLENECK_SYSTEM_PROMPT = `You are an expert process analyst specialising in bottleneck detection, cross-departmental friction analysis, and redundancy identification.

## Analysis Objectives

### 1. Bottleneck Detection
Identify process steps where:
- **Queue buildup**: Work accumulates waiting to be processed (many incoming flows, single outgoing)
- **Handoff stalls**: Work stalls at department boundaries or role transitions
- **Cycle time disproportion**: Steps that take disproportionately long compared to others in the same process

### 2. Cross-Department Friction
Identify handoff points where:
- Data is likely re-keyed between departments (manual data entry from one system to another)
- Format changes occur (e.g., spreadsheet to email to form)
- Information is lost or degraded during transfer
- Multiple approvals are required across department boundaries
- Handoffs create waiting time due to timezone/schedule misalignment

### 3. Redundancy Detection
Identify:
- Duplicate processes across departments (same outcome, different teams doing it)
- Parallel processes that could be consolidated
- Steps that duplicate work already done upstream

## Instructions

Analyse the provided process maps and identify specific bottlenecks, cross-departmental friction points, and redundancies.

For each finding, provide:
- The type of finding
- Concrete description with evidence
- Which process and steps are affected
- Severity rating (high/medium/low)
- For cross-dept issues: source and target departments
- For redundancies: which processes are duplicates

Focus on structural evidence from the process data. Look at the flow patterns, gateway configurations, handoff structures, and process similarities.

Respond with valid JSON matching the output schema. Include ONLY the JSON object, no other text.`;

// ── Service ─────────────────────────────────────────────────────

export async function analyseBottlenecks(
  orgId: string,
  processes: ProcessMap[],
): Promise<BottleneckAnalysisResult> {
  if (processes.length === 0) {
    return {
      orgId,
      findings: [],
      crossDeptFrictionCount: 0,
      redundancyCount: 0,
      bottleneckCount: 0,
    };
  }

  // Extract unique departments from processes
  const departments = [
    ...new Set(processes.map((p) => p.department).filter(Boolean) as string[]),
  ];

  // Also pull ontology nodes to enrich department context
  let ontologyDepts: string[] = [];
  try {
    const ontology = await graph.ontology.read(orgId, { entityType: 'department' });
    ontologyDepts = ontology.nodes.map((n: OntologyNode) => n.name);
  } catch {
    // Ontology read is best-effort enrichment
  }

  const allDepartments = [...new Set([...departments, ...ontologyDepts])];

  const input: BottleneckInput = {
    orgId,
    processes: processes.map((p) => ({
      id: p.id,
      name: p.name,
      department: p.department,
      level: p.level,
      elements: p.elements.map((e) => ({
        id: e.id,
        type: e.type,
        name: e.name,
        properties: e.properties,
      })),
      connections: p.connections,
      crossDeptHandoffs: p.crossDeptHandoffs,
    })),
    departments: allDepartments,
  };

  try {
    const result = await llmCall(
      {
        model: 'opus',
        systemPrompt: BOTTLENECK_SYSTEM_PROMPT,
        inputSchema: BottleneckInputSchema,
        outputSchema: BottleneckOutputSchema,
        sanitise: true,
        orgId,
      },
      input,
    );

    const findings = result.data.findings;

    const crossDeptFrictionCount = findings.filter(
      (f) => f.type === 'cross_dept_friction',
    ).length;
    const redundancyCount = findings.filter(
      (f) => f.type === 'redundancy',
    ).length;
    const bottleneckCount = findings.filter(
      (f) =>
        f.type === 'queue_buildup' ||
        f.type === 'handoff_stall' ||
        f.type === 'cycle_time_disproportion',
    ).length;

    return {
      orgId,
      findings,
      crossDeptFrictionCount,
      redundancyCount,
      bottleneckCount,
    };
  } catch (error) {
    throw new AnalysisFailedError(
      `Bottleneck analysis failed for org ${orgId}: ${(error as Error).message}`,
      { orgId, cause: error as Error },
    );
  }
}
