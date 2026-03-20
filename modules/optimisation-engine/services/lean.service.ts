import { z } from 'zod';
import { llmCall } from '@nexus/llm';
import { graph } from '@nexus/graph';
import type { ProcessMap } from '@nexus/contracts/processes';
import {
  type LeanAnalysisResult,
  type LeanWasteFinding,
  LeanWasteType,
  LeanWasteFinding as LeanWasteFindingSchema,
} from '../types.js';
import { AnalysisFailedError } from '../errors.js';

// ── LLM Schemas ─────────────────────────────────────────────────

const LeanInputSchema = z.object({
  orgId: z.string(),
  processes: z.array(z.object({
    id: z.string(),
    name: z.string(),
    department: z.string().optional(),
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
});

type LeanInput = z.infer<typeof LeanInputSchema>;

const LeanOutputSchema = z.object({
  findings: z.array(LeanWasteFindingSchema),
});

// ── System Prompt ───────────────────────────────────────────────

const LEAN_SYSTEM_PROMPT = `You are an expert LEAN process analyst. Your task is to identify the 8 wastes (DOWNTIME) across business processes.

## The 8 Wastes of LEAN

1. **Defects** — Work that contains errors, rework, corrections. Examples: data entry errors requiring correction, returned products, invoice discrepancies.

2. **Overproduction** — Producing more than needed or before needed. Examples: generating reports nobody reads, creating excessive copies, processing orders before confirmation.

3. **Waiting** — Idle time between process steps. Examples: waiting for approvals, waiting for information from another department, system downtime.

4. **Non-utilized talent** — Underusing people's skills and knowledge. Examples: skilled employees doing routine data entry, not consulting domain experts, ignoring frontline suggestions.

5. **Transportation** — Unnecessary movement of information or materials. Examples: emailing files that could be in a shared system, physical document routing, data transferred between incompatible systems.

6. **Inventory** — Excess work-in-progress or stored information. Examples: backlog of unprocessed applications, excessive email queues, unused stockpiles of forms.

7. **Motion** — Unnecessary steps within a process. Examples: switching between multiple software systems, unnecessary clicks or screens, redundant form fields.

8. **Extra processing** — Doing more work than required. Examples: multiple approval levels for low-value items, collecting data that is never used, over-formatting documents.

## Instructions

Analyse the provided process maps and identify specific instances of each waste type. For each finding:
- Identify the specific waste type
- Describe what you found with concrete evidence from the process data
- List the affected step IDs
- Rate severity (high/medium/low)
- Suggest a concrete fix

Focus on actionable, evidence-based findings. Do not speculate — only report wastes you can directly identify from the process structure, handoffs, and step properties.

Respond with valid JSON matching the output schema. Include ONLY the JSON object, no other text.`;

// ── Service ─────────────────────────────────────────────────────

export async function analyseLeanWastes(
  orgId: string,
  processes: ProcessMap[],
): Promise<LeanAnalysisResult> {
  if (processes.length === 0) {
    return {
      orgId,
      findings: [],
      totalWasteCount: 0,
      wasteByType: {},
      analysedProcessCount: 0,
    };
  }

  // Prepare input for LLM — strip position/size data to save tokens
  const input: LeanInput = {
    orgId,
    processes: processes.map((p) => ({
      id: p.id,
      name: p.name,
      department: p.department,
      elements: p.elements.map((e) => ({
        id: e.id,
        type: e.type,
        name: e.name,
        properties: e.properties,
      })),
      connections: p.connections,
      crossDeptHandoffs: p.crossDeptHandoffs,
    })),
  };

  try {
    const result = await llmCall(
      {
        model: 'opus',
        systemPrompt: LEAN_SYSTEM_PROMPT,
        inputSchema: LeanInputSchema,
        outputSchema: LeanOutputSchema,
        sanitise: true,
        orgId,
      },
      input,
    );

    const findings = result.data.findings;

    // Compute waste-by-type counts
    const wasteByType: Partial<Record<string, number>> = {};
    for (const finding of findings) {
      wasteByType[finding.wasteType] = (wasteByType[finding.wasteType] ?? 0) + 1;
    }

    return {
      orgId,
      findings,
      totalWasteCount: findings.length,
      wasteByType: wasteByType as Record<string, number>,
      analysedProcessCount: processes.length,
    };
  } catch (error) {
    throw new AnalysisFailedError(
      `LEAN waste analysis failed for org ${orgId}: ${(error as Error).message}`,
      { orgId, cause: error as Error },
    );
  }
}

/**
 * Analyses a subset of processes for LEAN wastes.
 * Useful for targeted re-analysis after process changes.
 */
export async function analyseLeanWastesForProcesses(
  orgId: string,
  processIds: string[],
): Promise<LeanAnalysisResult> {
  const rawProcesses = await graph.processes.read(orgId);
  const processes = (rawProcesses as ProcessMap[]).filter((p) =>
    processIds.includes(p.id),
  );
  return analyseLeanWastes(orgId, processes);
}
