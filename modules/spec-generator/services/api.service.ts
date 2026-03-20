import { llmCall } from '@nexus/llm';
import {
  ApiInput,
  ApiOutput,
  type ModuleDefinition,
  type EntityDefinition,
  type ApiEndpoint,
} from '../types.js';
import { ApiGenerationError } from '../errors.js';

// ── Prompts ─────────────────────────────────────────────────────

const API_SYSTEM_PROMPT = `You are an expert API architect. Your task is to generate a comprehensive REST API specification for a software module based on its entities and business processes.

Given:
- The module name
- Entity definitions (data models with fields and relationships)
- Process definitions showing how data flows and where handoff points exist

You must:

1. **Generate CRUD endpoints** for each entity:
   - GET /api/{module}/{entities} — list with pagination, filtering, sorting
   - GET /api/{module}/{entities}/:id — get single record
   - POST /api/{module}/{entities} — create new record
   - PUT /api/{module}/{entities}/:id — full update
   - PATCH /api/{module}/{entities}/:id — partial update
   - DELETE /api/{module}/{entities}/:id — soft delete

2. **Generate process-specific endpoints** for each handoff point:
   - Status transitions (e.g., POST /api/orders/:id/approve)
   - Batch operations (e.g., POST /api/invoices/batch-send)
   - Search/filter endpoints (e.g., GET /api/reports/summary)
   - File upload/download (e.g., POST /api/documents/upload)

3. **Define request/response schemas** as JSON Schema objects:
   - Request body: Required fields, optional fields, validation rules
   - Response body: Full entity shape including computed fields
   - Use proper HTTP status codes in descriptions

4. **All endpoints require authentication** (Bearer token) unless explicitly public.

5. **Use kebab-case** for URL paths, camelCase for JSON fields.

Output a JSON object with an "endpoints" array. Each endpoint has method, path, description, requestSchema (optional), and responseSchema (optional).

Be comprehensive — include all CRUD operations AND all process-specific endpoints.`;

// ── Service ─────────────────────────────────────────────────────

export async function generateApiContracts(
  orgId: string,
  module: ModuleDefinition,
  entities: EntityDefinition[],
): Promise<ApiEndpoint[]> {
  try {
    const result = await llmCall(
      {
        model: 'opus',
        systemPrompt: API_SYSTEM_PROMPT,
        inputSchema: ApiInput,
        outputSchema: ApiOutput,
        sanitise: true,
        orgId,
      },
      {
        moduleName: module.name,
        entities,
        processes: module.processes,
      },
    );

    return result.data.endpoints.map((e) => ({
      method: e.method,
      path: e.path,
      description: e.description,
      requestSchema: e.requestSchema ?? {},
      responseSchema: e.responseSchema ?? {},
      authentication: true,
      rateLimitPerMinute: inferRateLimit(e.method),
    }));
  } catch (error) {
    throw new ApiGenerationError(
      `Failed to generate API contracts for module "${module.name}" in org ${orgId}: ${(error as Error).message}`,
      { orgId, cause: error as Error },
    );
  }
}

// ── Helpers ─────────────────────────────────────────────────────

function inferRateLimit(method: string): number {
  switch (method) {
    case 'GET': return 120;
    case 'POST': return 60;
    case 'PUT':
    case 'PATCH': return 60;
    case 'DELETE': return 30;
    default: return 60;
  }
}
