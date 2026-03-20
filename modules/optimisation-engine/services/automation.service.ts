import { z } from 'zod';
import { llmCall } from '@nexus/llm';
import type { ProcessMap } from '@nexus/contracts/processes';
import {
  type AutomationAnalysisResult,
  type AutomationScore,
  AutomationScore as AutomationScoreSchema,
} from '../types.js';
import { AnalysisFailedError } from '../errors.js';

// ── LLM Schemas ─────────────────────────────────────────────────

const AutomationInputSchema = z.object({
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
  })),
});

type AutomationInput = z.infer<typeof AutomationInputSchema>;

const AutomationOutputSchema = z.object({
  scores: z.array(AutomationScoreSchema),
});

// ── System Prompt ───────────────────────────────────────────────

const AUTOMATION_SYSTEM_PROMPT = `You are an expert in business process automation assessment. Your task is to evaluate every process step for automation readiness.

## Scoring Criteria (1-5 scale for each)

### Structure (How standardised is the step?)
1 = Completely ad-hoc, no defined procedure
2 = Loosely defined, varies by person
3 = Documented but with significant variations
4 = Well-documented with minor variations
5 = Fully standardised, exact same steps every time

### Data Quality (How clean and structured is the data?)
1 = Unstructured, inconsistent formats, missing data
2 = Semi-structured with frequent quality issues
3 = Mostly structured but occasional anomalies
4 = Well-structured with rare quality issues
5 = Perfectly structured, validated, consistent

### Decision Complexity (How complex are decisions in this step?)
1 = Highly complex, requires expert judgment and intuition (HARDER to automate)
2 = Complex, multiple interdependent factors
3 = Moderate, rule-based with some exceptions
4 = Simple, clear rules with few exceptions
5 = Trivial, purely mechanical with no decisions (EASIEST to automate)

### Exception Frequency (How often do exceptions occur?)
1 = Very frequent, most cases are exceptions (HARDER to automate)
2 = Frequent, many cases require special handling
3 = Moderate, some exceptions need manual intervention
4 = Rare, occasional edge cases
5 = Almost never, highly predictable (EASIEST to automate)

### Overall Score Calculation
Overall = (structure + dataQuality + decisionComplexity + exceptionFrequency) / 4

### Readiness Classification
- Overall >= 4.0: "immediately_automatable" — can be automated now with current tools
- Overall >= 2.5: "needs_restructuring" — needs process changes before automation
- Overall < 2.5: "not_suitable" — too complex or variable for current automation

## Instructions

Evaluate EVERY task and user task step in the provided processes. Skip start/end events, gateways, and flow elements.

For each step, provide:
- All four dimension scores with rationale
- Overall score
- Readiness classification
- Brief rationale for the overall assessment

Be realistic — not everything should be automated. Look at step names, types, and properties for evidence.

Respond with valid JSON matching the output schema. Include ONLY the JSON object, no other text.`;

// ── Service ─────────────────────────────────────────────────────

export async function analyseAutomationReadiness(
  orgId: string,
  processes: ProcessMap[],
): Promise<AutomationAnalysisResult> {
  if (processes.length === 0) {
    return {
      orgId,
      scores: [],
      immediatelyAutomatableCount: 0,
      needsRestructuringCount: 0,
      notSuitableCount: 0,
      averageReadinessScore: 0,
    };
  }

  // Filter to only include task-like elements for scoring
  const input: AutomationInput = {
    orgId,
    processes: processes.map((p) => ({
      id: p.id,
      name: p.name,
      department: p.department,
      elements: p.elements.filter((e) =>
        e.type === 'task' ||
        e.type === 'userTask' ||
        e.type === 'serviceTask' ||
        e.type === 'subProcess',
      ).map((e) => ({
        id: e.id,
        type: e.type,
        name: e.name,
        properties: e.properties,
      })),
      connections: p.connections,
    })),
  };

  // Skip if no scorable elements exist
  const totalElements = input.processes.reduce(
    (sum, p) => sum + p.elements.length,
    0,
  );
  if (totalElements === 0) {
    return {
      orgId,
      scores: [],
      immediatelyAutomatableCount: 0,
      needsRestructuringCount: 0,
      notSuitableCount: 0,
      averageReadinessScore: 0,
    };
  }

  try {
    const result = await llmCall(
      {
        model: 'opus',
        systemPrompt: AUTOMATION_SYSTEM_PROMPT,
        inputSchema: AutomationInputSchema,
        outputSchema: AutomationOutputSchema,
        sanitise: true,
        orgId,
      },
      input,
    );

    const scores = result.data.scores;

    const immediatelyAutomatableCount = scores.filter(
      (s) => s.readiness === 'immediately_automatable',
    ).length;
    const needsRestructuringCount = scores.filter(
      (s) => s.readiness === 'needs_restructuring',
    ).length;
    const notSuitableCount = scores.filter(
      (s) => s.readiness === 'not_suitable',
    ).length;

    const averageReadinessScore =
      scores.length > 0
        ? scores.reduce((sum, s) => sum + s.overallScore, 0) / scores.length
        : 0;

    return {
      orgId,
      scores,
      immediatelyAutomatableCount,
      needsRestructuringCount,
      notSuitableCount,
      averageReadinessScore: Math.round(averageReadinessScore * 100) / 100,
    };
  } catch (error) {
    throw new AnalysisFailedError(
      `Automation readiness analysis failed for org ${orgId}: ${(error as Error).message}`,
      { orgId, cause: error as Error },
    );
  }
}
