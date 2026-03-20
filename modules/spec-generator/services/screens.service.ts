import { llmCall } from '@nexus/llm';
import {
  ScreensInput,
  ScreensOutput,
  type ModuleDefinition,
  type EntityDefinition,
  type ApiEndpoint,
  type ScreenDefinition,
} from '../types.js';
import { ScreenGenerationError } from '../errors.js';

// ── Prompts ─────────────────────────────────────────────────────

const SCREENS_SYSTEM_PROMPT = `You are an expert UX architect. Your task is to generate screen/view descriptions for a software module based on its business processes, data entities, and API endpoints.

Given:
- The module name
- Process definitions showing user-facing steps
- Entity definitions (data models)
- API endpoint definitions

You must:

1. **For each user-facing process step**, describe the required screen:
   - List views: Tables/grids showing entity records with filters, search, pagination
   - Detail views: Single record display with all fields, related data, action buttons
   - Form views: Create/edit forms with field specifications
   - Dashboard views: Summary statistics, charts, recent activity
   - Approval views: Review queues with approve/reject/comment actions

2. **Screen properties**:
   - name: PascalCase screen name (e.g., "OrderList", "InvoiceDetail", "UserForm")
   - description: What the user sees and can do on this screen
   - route: URL path for the screen (e.g., "/orders", "/orders/:id", "/orders/new")
   - components: UI components needed (e.g., "DataTable", "Form", "Chart", "StatusBadge")
   - dataRequired: Entity names and fields the screen needs to display
   - actionsAvailable: User actions available (e.g., "create", "edit", "approve", "export")

3. **Navigation flow**: Screens should logically connect — list → detail → edit → back to list.

4. **Include standard screens**: Every module should have at minimum:
   - A list/dashboard screen as the entry point
   - Detail screens for primary entities
   - Form screens for data entry

Output a JSON object with a "screens" array. Each screen has name, description, route, components, dataRequired, and actionsAvailable.

Be comprehensive — include ALL user-facing interactions from the processes.`;

// ── Service ─────────────────────────────────────────────────────

export async function generateScreens(
  orgId: string,
  module: ModuleDefinition,
  entities: EntityDefinition[],
  apiEndpoints: ApiEndpoint[],
): Promise<ScreenDefinition[]> {
  try {
    const result = await llmCall(
      {
        model: 'opus',
        systemPrompt: SCREENS_SYSTEM_PROMPT,
        inputSchema: ScreensInput,
        outputSchema: ScreensOutput,
        sanitise: true,
        orgId,
      },
      {
        moduleName: module.name,
        processes: module.processes,
        entities,
        apiEndpoints,
      },
    );

    return result.data.screens.map((s) => ({
      ...s,
      formFields: [],
      navigationTargets: [],
    }));
  } catch (error) {
    throw new ScreenGenerationError(
      `Failed to generate screens for module "${module.name}" in org ${orgId}: ${(error as Error).message}`,
      { orgId, cause: error as Error },
    );
  }
}
