import { llmCall } from '@nexus/llm';
import {
  CriteriaInput,
  CriteriaOutput,
  type ModuleDefinition,
  type BusinessRule,
  type ScreenDefinition,
  type AcceptanceCriterion,
} from '../types.js';
import { CriteriaGenerationError } from '../errors.js';

// ── Prompts ─────────────────────────────────────────────────────

const CRITERIA_SYSTEM_PROMPT = `You are an expert QA engineer and business analyst. Your task is to generate comprehensive acceptance criteria in Given/When/Then (Gherkin) format for a software module.

Given:
- The module name
- Process definitions showing the business workflow
- Business rules extracted from decision gateways
- Screen definitions showing user interactions

You must:

1. **For each functional requirement**, produce acceptance criteria covering:
   - **Happy path**: The expected successful flow
   - **Error paths**: What happens when things go wrong (validation fails, external system down, unauthorised access)
   - **Edge cases**: Boundary conditions, empty states, concurrent operations, maximum limits

2. **Criteria format**:
   - id: Unique identifier (e.g., "AC-001")
   - feature: The feature or user story this criterion belongs to
   - given: The precondition/context (e.g., "Given a logged-in user with 'Manager' role")
   - when: The action/trigger (e.g., "When they submit an order with total > $1000")
   - then: The expected outcome (e.g., "Then the order is routed to VP approval queue and the manager receives a confirmation email")

3. **Coverage requirements**:
   - Every business rule must have at least one criterion testing it
   - Every screen must have criteria for its primary actions
   - Every API endpoint's error responses must have criteria
   - CRUD operations need criteria for create, read, update, delete, and list
   - Permission checks need criteria for authorised AND unauthorised access

4. **Link back to source**: Where possible, reference the process step or business rule that this criterion validates.

Output a JSON object with a "criteria" array. Each criterion has id, feature, given, when, then.

Be thorough — aim for complete coverage. Include negative tests and edge cases, not just happy paths.`;

// ── Service ─────────────────────────────────────────────────────

export async function generateAcceptanceCriteria(
  orgId: string,
  module: ModuleDefinition,
  businessRules: BusinessRule[],
  screens: ScreenDefinition[],
): Promise<AcceptanceCriterion[]> {
  try {
    const result = await llmCall(
      {
        model: 'opus',
        systemPrompt: CRITERIA_SYSTEM_PROMPT,
        inputSchema: CriteriaInput,
        outputSchema: CriteriaOutput,
        sanitise: true,
        orgId,
      },
      {
        moduleName: module.name,
        processes: module.processes,
        businessRules,
        screens,
      },
    );

    return result.data.criteria.map((c) => ({
      ...c,
      type: inferCriterionType(c.given, c.when, c.then),
    }));
  } catch (error) {
    throw new CriteriaGenerationError(
      `Failed to generate acceptance criteria for module "${module.name}" in org ${orgId}: ${(error as Error).message}`,
      { orgId, cause: error as Error },
    );
  }
}

// ── Helpers ─────────────────────────────────────────────────────

function inferCriterionType(
  given: string,
  when: string,
  then: string,
): 'happy-path' | 'error-path' | 'edge-case' {
  const combined = `${given} ${when} ${then}`.toLowerCase();

  const errorIndicators = [
    'error', 'fail', 'invalid', 'unauthori', 'denied', 'reject',
    'timeout', 'not found', 'forbidden', 'missing', 'exceed',
  ];
  if (errorIndicators.some((indicator) => combined.includes(indicator))) {
    return 'error-path';
  }

  const edgeCaseIndicators = [
    'empty', 'zero', 'maximum', 'minimum', 'boundary', 'concurrent',
    'duplicate', 'already exists', 'simultaneous', 'no records',
  ];
  if (edgeCaseIndicators.some((indicator) => combined.includes(indicator))) {
    return 'edge-case';
  }

  return 'happy-path';
}
