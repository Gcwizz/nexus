import { llmCall } from '@nexus/llm';
import {
  RulesInput,
  RulesOutput,
  type ModuleDefinition,
  type BusinessRule,
} from '../types.js';
import { RulesExtractionError } from '../errors.js';

// ── Prompts ─────────────────────────────────────────────────────

const RULES_SYSTEM_PROMPT = `You are an expert business analyst. Your task is to extract structured business rules from process definitions, particularly from decision gateways (BPMN exclusive/inclusive gateways).

Given:
- The module name
- Process definitions containing steps and decision points
- Gateway definitions with conditions and branching logic

You must:

1. **Parse decision gateways** into conditional rules:
   - Each exclusive gateway branch becomes a rule with a condition and action
   - Inclusive gateways may produce multiple rules that can fire simultaneously
   - Parallel gateways indicate concurrent execution (not conditional)

2. **Extract exception handling paths**:
   - Error boundary events become exception rules
   - Timeout paths become deadline rules
   - Escalation paths become escalation rules

3. **Generate structured rule objects**:
   - id: Unique identifier (e.g., "RULE-001")
   - description: Human-readable description of what the rule does
   - condition: A logical expression (e.g., "order.total > 1000 AND customer.tier == 'gold'")
   - action: What happens when the condition is met (e.g., "Apply 10% discount and route to VIP fulfilment")
   - priority: Number from 1 (highest) to 100 (lowest) — used to resolve conflicts when multiple rules match

4. **Priority ordering**: When two rules could conflict (overlapping conditions), the lower priority number wins. Assign priorities based on:
   - Safety/compliance rules: 1-10
   - Business-critical rules: 11-30
   - Operational rules: 31-60
   - Convenience/optimisation rules: 61-100

Output a JSON object with a "rules" array. Each rule has id, description, condition, action, and priority.

Be thorough — extract ALL decision points, not just the obvious ones. Include implicit rules like data validation, status transitions, and authorization checks.`;

// ── Service ─────────────────────────────────────────────────────

export async function extractBusinessRules(
  orgId: string,
  module: ModuleDefinition,
): Promise<BusinessRule[]> {
  // Extract gateways from processes
  const gateways = module.processes.flatMap((p) => p.gateways ?? []);

  try {
    const result = await llmCall(
      {
        model: 'opus',
        systemPrompt: RULES_SYSTEM_PROMPT,
        inputSchema: RulesInput,
        outputSchema: RulesOutput,
        sanitise: true,
        orgId,
      },
      {
        moduleName: module.name,
        processes: module.processes,
        gateways,
      },
    );

    return result.data.rules.map((r) => ({
      ...r,
      exceptionPaths: [],
    }));
  } catch (error) {
    throw new RulesExtractionError(
      `Failed to extract business rules for module "${module.name}" in org ${orgId}: ${(error as Error).message}`,
      { orgId, cause: error as Error },
    );
  }
}
