import type { ProcessMap, WhatIfResult } from '@nexus/contracts/processes';

// ── What-If Action Heuristics ─────────────────────────────────────

/**
 * Default cost parameters. Can be overridden per-request.
 */
export interface WhatIfParams {
  /** Hourly cost of an employee in GBP (default: 35) */
  hourlyRate: number;
  /** Working weeks per year (default: 48) */
  weeksPerYear: number;
  /** Working hours per week (default: 37.5) */
  hoursPerWeek: number;
}

const DEFAULT_PARAMS: WhatIfParams = {
  hourlyRate: 35,
  weeksPerYear: 48,
  hoursPerWeek: 37.5,
};

/**
 * Heuristic multipliers for each action type.
 * These represent the fraction of time saved by each action.
 */
const ACTION_MULTIPLIERS = {
  automate: 0.85,     // Automation typically saves 85% of manual time
  remove: 1.0,        // Removing a step saves 100%
  optimise: 0.35,     // Optimisation typically saves 35%
  consolidate: 0.50,  // Consolidating saves 50% by reducing duplication
} as const;

/**
 * Confidence levels based on the quality of input data.
 */
function determineConfidence(
  hasFrequency: boolean,
  hasDuration: boolean,
  hasRoleCount: boolean,
): WhatIfResult['confidence'] {
  const score = (hasFrequency ? 1 : 0) + (hasDuration ? 1 : 0) + (hasRoleCount ? 1 : 0);
  if (score >= 3) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
}

// ── Frequency Parsing ─────────────────────────────────────────────

/**
 * Parse a natural-language frequency string into occurrences per week.
 */
function parseFrequencyPerWeek(frequency: string | undefined): number {
  if (!frequency) return 5; // Default: once per business day

  const lower = frequency.toLowerCase().trim();

  if (lower.includes('hourly')) return 37.5;
  if (lower.includes('per hour')) {
    const match = lower.match(/(\d+)\s*per\s*hour/);
    return match ? parseFloat(match[1]) * 37.5 : 37.5;
  }
  if (lower.includes('daily') || lower.includes('per day') || lower.includes('every day')) return 5;
  if (lower.includes('twice daily') || lower.includes('2x daily')) return 10;
  if (lower.includes('weekly') || lower.includes('per week') || lower.includes('every week')) return 1;
  if (lower.includes('biweekly') || lower.includes('fortnightly')) return 0.5;
  if (lower.includes('monthly') || lower.includes('per month')) return 0.25;
  if (lower.includes('quarterly')) return 1 / 13;
  if (lower.includes('annually') || lower.includes('yearly')) return 1 / 48;
  if (lower.includes('per transaction')) return 20; // Assume ~20 transactions/week for a typical SME

  // Try to parse "X times per week" patterns
  const timesPerWeek = lower.match(/(\d+)\s*(?:times?\s*)?per\s*week/);
  if (timesPerWeek) return parseFloat(timesPerWeek[1]);

  const timesPerDay = lower.match(/(\d+)\s*(?:times?\s*)?per\s*day/);
  if (timesPerDay) return parseFloat(timesPerDay[1]) * 5;

  return 5; // Fallback: daily
}

// ── Duration Parsing ──────────────────────────────────────────────

/**
 * Parse a natural-language duration string into hours.
 */
function parseDurationHours(duration: string | undefined): number {
  if (!duration) return 0.5; // Default: 30 minutes

  const lower = duration.toLowerCase().trim();

  // "X hours"
  const hours = lower.match(/(\d+(?:\.\d+)?)\s*hours?/);
  if (hours) return parseFloat(hours[1]);

  // "X minutes"
  const minutes = lower.match(/(\d+(?:\.\d+)?)\s*min(?:utes?)?/);
  if (minutes) return parseFloat(minutes[1]) / 60;

  // "X days"
  const days = lower.match(/(\d+(?:\.\d+)?)\s*days?/);
  if (days) return parseFloat(days[1]) * 7.5; // 7.5 hours per day

  return 0.5; // Fallback: 30 minutes
}

// ── What-If Calculator ────────────────────────────────────────────

export interface WhatIfInput {
  processId: string;
  elementId: string;
  action: WhatIfResult['action'];
  params?: Partial<WhatIfParams>;
}

/**
 * Calculate ROI projections for a specific action on a process element.
 *
 * This uses simple heuristics (no LLM) for real-time calculation:
 * - Estimate hours saved = frequency × duration × action multiplier
 * - Estimate cost savings = hours saved × hourly rate × weeks per year × affected people
 */
export function calculateWhatIf(
  process: ProcessMap,
  input: WhatIfInput,
): WhatIfResult {
  const params = { ...DEFAULT_PARAMS, ...input.params };

  // Find the target element
  const element = process.elements.find((el) => el.id === input.elementId);

  // Extract metadata from element properties
  const frequency = element?.properties?.frequency as string | undefined;
  const duration = element?.properties?.estimatedDuration as string | undefined;
  const involvedRoles = element?.properties?.involvedRoles as string[] | undefined;

  // Parse inputs
  const occurrencesPerWeek = parseFrequencyPerWeek(frequency);
  const durationHours = parseDurationHours(duration);
  const affectedPeople = involvedRoles?.length ?? estimateAffectedPeople(process, input.elementId);

  // Calculate savings
  const actionMultiplier = ACTION_MULTIPLIERS[input.action];
  const hoursPerWeek = occurrencesPerWeek * durationHours * actionMultiplier * affectedPeople;
  const costPerYear = hoursPerWeek * params.hourlyRate * params.weeksPerYear;

  // Determine confidence
  const confidence = determineConfidence(
    frequency !== undefined,
    duration !== undefined,
    involvedRoles !== undefined && involvedRoles.length > 0,
  );

  return {
    processId: input.processId,
    elementId: input.elementId,
    action: input.action,
    estimatedSavings: {
      hoursPerWeek: Math.round(hoursPerWeek * 10) / 10,
      affectedPeople,
      costPerYear: Math.round(costPerYear),
    },
    confidence,
  };
}

/**
 * Estimate the number of people affected by a process step based on
 * how many lanes/departments are involved in its connections.
 */
function estimateAffectedPeople(process: ProcessMap, elementId: string): number {
  const connectedDepts = new Set<string>();

  // Get department of the element itself
  const element = process.elements.find((el) => el.id === elementId);
  const dept = element?.properties?.department as string | undefined;
  if (dept) connectedDepts.add(dept);

  // Check cross-department handoffs involving this element
  const connectedConnectionIds = process.connections
    .filter((c) => c.sourceId === elementId || c.targetId === elementId)
    .map((c) => c.id);

  for (const handoff of process.crossDeptHandoffs) {
    if (connectedConnectionIds.includes(handoff.connectionId)) {
      connectedDepts.add(handoff.fromDept);
      connectedDepts.add(handoff.toDept);
    }
  }

  // Heuristic: 2 people per department involved
  return Math.max(1, connectedDepts.size * 2);
}

/**
 * Batch calculation for all task elements in a process.
 * Useful for generating a heatmap of potential savings.
 */
export function calculateWhatIfBatch(
  process: ProcessMap,
  action: WhatIfResult['action'],
  params?: Partial<WhatIfParams>,
): WhatIfResult[] {
  const taskTypes = new Set(['task', 'userTask', 'serviceTask', 'subProcess']);

  return process.elements
    .filter((el) => taskTypes.has(el.type))
    .map((el) => calculateWhatIf(process, {
      processId: process.id,
      elementId: el.id,
      action,
      params,
    }));
}
