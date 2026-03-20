import { llmCall } from '@nexus/llm';
import {
  IntegrationInput,
  IntegrationOutput,
  type ModuleDefinition,
  type IntegrationSpec,
} from '../types.js';
import { IntegrationGenerationError } from '../errors.js';

// ── Prompts ─────────────────────────────────────────────────────

const INTEGRATION_SYSTEM_PROMPT = `You are an expert integration architect. Your task is to generate integration specifications for a software module based on its interactions with external systems.

Given:
- The module name
- Process definitions showing external system interactions (send tasks, receive tasks, service tasks referencing external systems)
- List of external systems identified in the processes

You must:

1. **For each external system interaction**, define:
   - system: Name of the external system (e.g., "Salesforce", "SAP", "Stripe")
   - type: Integration type — "api" (REST/SOAP), "file" (SFTP/S3), "event" (message queue), "webhook" (HTTP callback)
   - direction: Data flow direction — "inbound" (external → this system), "outbound" (this system → external), "bidirectional" (both)
   - dataMapping: Object mapping internal field names to external field names (e.g., {"customerId": "sf_account_id", "email": "sf_email"})

2. **Error handling for each integration**:
   - Define retry policy (none, exponential-backoff, fixed-interval)
   - Set max retries
   - Specify whether a dead-letter queue is needed
   - Define fallback action when all retries exhausted

3. **Reference source systems** from Module 1 (Connector Hub) where applicable. If a process references an external system that was connected during data ingestion, note the source system reference.

4. **Consider data transformation**:
   - Map data types between systems
   - Handle null/missing values
   - Handle format differences (dates, currencies, phone numbers)

Output a JSON object with an "integrations" array. Each integration has system, type, direction, and dataMapping.

Be comprehensive — include ALL external system interactions from the processes.`;

// ── Service ─────────────────────────────────────────────────────

export async function generateIntegrations(
  orgId: string,
  module: ModuleDefinition,
): Promise<IntegrationSpec[]> {
  // Collect external systems from processes
  const externalSystems = Array.from(new Set(
    module.processes.flatMap((p) => p.externalSystems ?? []),
  ));

  // Skip if no external systems
  if (externalSystems.length === 0) {
    return [];
  }

  try {
    const result = await llmCall(
      {
        model: 'opus',
        systemPrompt: INTEGRATION_SYSTEM_PROMPT,
        inputSchema: IntegrationInput,
        outputSchema: IntegrationOutput,
        sanitise: true,
        orgId,
      },
      {
        moduleName: module.name,
        processes: module.processes,
        externalSystems,
      },
    );

    return result.data.integrations.map((i) => ({
      ...i,
      errorHandling: {
        retryPolicy: 'exponential-backoff' as const,
        maxRetries: 3,
        deadLetterQueue: true,
        fallbackAction: 'Log error and notify operations team',
      },
    }));
  } catch (error) {
    throw new IntegrationGenerationError(
      `Failed to generate integrations for module "${module.name}" in org ${orgId}: ${(error as Error).message}`,
      { orgId, cause: error as Error },
    );
  }
}
