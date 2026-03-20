import { llmCall } from '@nexus/llm';
import { graph } from '@nexus/graph';
import {
  DecompositionInput,
  DecompositionOutput,
  type ModuleDefinition,
  type SharedConcern,
} from '../types.js';
import { DecompositionError, TargetStateNotFoundError } from '../errors.js';

// ── Prompts ─────────────────────────────────────────────────────

const DECOMPOSITION_SYSTEM_PROMPT = `You are an expert enterprise software architect. Your task is to decompose a target state business design into logical software modules, grouped by department or functional area.

Given the target state process maps, ontology (entities and relationships), and process definitions, you must:

1. **Group processes by department**: Each department's processes become one module. Processes that span multiple departments should be placed in the primary owning department.

2. **Identify shared concerns**: Look for cross-cutting capabilities that multiple modules need:
   - Authentication and authorisation (auth)
   - Role-based access control (rbac)
   - Audit logging and compliance (audit)
   - Notification systems — email, SMS, in-app (notifications)
   - File upload, processing, storage (file-handling)

3. **Define module boundaries**: Each module should be cohesive — all processes within it serve the same business function. Modules should have minimal coupling — interactions between modules happen via well-defined interfaces.

4. **Map dependencies**: For each module, list which other modules it depends on. A dependency means the module needs data or functionality from another module.

Output a JSON object with:
- "modules": array of module definitions, each with name, department, description, processIds (references to process IDs), sharedConcerns, and dependencies (names of other modules it depends on)
- "sharedComponents": array of shared cross-cutting components
- "dependencyGraph": object mapping module name to array of module names it depends on

Be comprehensive. Include ALL processes from the target state. Do not omit any department.`;

// ── Service ─────────────────────────────────────────────────────

export async function decomposeTargetState(
  orgId: string,
  designId: string,
): Promise<{
  modules: ModuleDefinition[];
  sharedComponents: SharedConcern[];
  dependencyGraph: Record<string, string[]>;
}> {
  // Read target state from graph
  const targetState = await graph.targetState.read(orgId, designId);
  if (!targetState) {
    throw new TargetStateNotFoundError(
      `Target state not found for org ${orgId}, design ${designId}`,
      { orgId },
    );
  }

  // Read ontology
  const ontology = await graph.ontology.read(orgId, { depth: 3 });

  // Read processes
  const processes = await graph.processes.read(orgId);

  try {
    const result = await llmCall(
      {
        model: 'opus',
        systemPrompt: DECOMPOSITION_SYSTEM_PROMPT,
        inputSchema: DecompositionInput,
        outputSchema: DecompositionOutput,
        sanitise: true,
        orgId,
      },
      {
        targetState,
        processes,
        ontology: {
          nodes: ontology.nodes,
          relationships: ontology.relationships,
        },
      },
    );

    // Map LLM output to ModuleDefinition format
    const modules: ModuleDefinition[] = result.data.modules.map((m) => ({
      name: m.name,
      department: m.department,
      description: m.description,
      processes: [], // Populated by matching processIds to full process data
      sharedConcerns: m.sharedConcerns,
      dependencies: m.dependencies,
    }));

    return {
      modules,
      sharedComponents: result.data.sharedComponents,
      dependencyGraph: result.data.dependencyGraph,
    };
  } catch (error) {
    if (error instanceof TargetStateNotFoundError) throw error;
    throw new DecompositionError(
      `Failed to decompose target state for org ${orgId}: ${(error as Error).message}`,
      { orgId, cause: error as Error },
    );
  }
}
