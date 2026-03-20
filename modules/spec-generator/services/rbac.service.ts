import { llmCall } from '@nexus/llm';
import {
  RBACInput,
  RBACOutput,
  type ModuleDefinition,
  type PermissionMatrix,
  type RoleDefinition,
} from '../types.js';
import { RBACGenerationError } from '../errors.js';

// ── Prompts ─────────────────────────────────────────────────────

const RBAC_SYSTEM_PROMPT = `You are an expert in enterprise access control. Your task is to generate a comprehensive role-based access control (RBAC) specification for a software module.

Given:
- The module name
- Process definitions with swimlanes (each swimlane represents an actor/role)
- Entity names that need permission controls

You must:

1. **Extract roles** from process swimlanes. Each unique swimlane performer becomes a role. Additionally, always include:
   - "Admin" role with full CRUD on all entities
   - "System" role for automated/service-to-service operations

2. **Map permissions** for each role to each entity:
   - create: Can create new records
   - read: Can view records
   - update: Can modify existing records
   - delete: Can remove records

3. **Permission format**: Each permission is a string like "entity:action" (e.g., "Invoice:create", "Order:read")

4. **Apply least-privilege principle**: Only grant permissions that the role actually needs based on the process definitions. A role that only views reports should only get read permissions.

5. **Identify admin capabilities**: Admin roles get all permissions. Regular users get only what their process swimlane requires.

Output a JSON object with a "roles" array. Each role has a "name" (string) and "permissions" (array of "entity:action" strings).

Be comprehensive — include ALL roles implied by the swimlanes and ALL entities.`;

// ── Service ─────────────────────────────────────────────────────

export async function generateRBAC(
  orgId: string,
  module: ModuleDefinition,
  entityNames: string[],
): Promise<{ roles: Array<{ name: string; permissions: string[] }>; matrix: PermissionMatrix }> {
  try {
    const result = await llmCall(
      {
        model: 'opus',
        systemPrompt: RBAC_SYSTEM_PROMPT,
        inputSchema: RBACInput,
        outputSchema: RBACOutput,
        sanitise: true,
        orgId,
      },
      {
        moduleName: module.name,
        processes: module.processes,
        entities: entityNames,
      },
    );

    const roles = result.data.roles;

    // Build the permission matrix from the roles
    const matrix = buildPermissionMatrix(roles, entityNames);

    return { roles, matrix };
  } catch (error) {
    throw new RBACGenerationError(
      `Failed to generate RBAC for module "${module.name}" in org ${orgId}: ${(error as Error).message}`,
      { orgId, cause: error as Error },
    );
  }
}

// ── Helpers ─────────────────────────────────────────────────────

function buildPermissionMatrix(
  roles: Array<{ name: string; permissions: string[] }>,
  entityNames: string[],
): PermissionMatrix {
  const matrixData: Record<string, Record<string, ('create' | 'read' | 'update' | 'delete')[]>> = {};

  const roleDefinitions: RoleDefinition[] = roles.map((role) => {
    matrixData[role.name] = {};

    const permissionEntries = new Map<string, Set<'create' | 'read' | 'update' | 'delete'>>();

    for (const perm of role.permissions) {
      const [entity, action] = perm.split(':');
      if (!entity || !action) continue;

      if (!permissionEntries.has(entity)) {
        permissionEntries.set(entity, new Set());
      }
      permissionEntries.get(entity)!.add(action as 'create' | 'read' | 'update' | 'delete');
    }

    const entries: RoleDefinition['permissions'] = [];

    for (const entityName of entityNames) {
      const actions = permissionEntries.get(entityName);
      const actionList = actions ? Array.from(actions) : [];
      matrixData[role.name]![entityName] = actionList;

      if (actionList.length > 0) {
        entries.push({
          entity: entityName,
          actions: actionList,
        });
      }
    }

    const isAdmin = role.name.toLowerCase().includes('admin') ||
      role.permissions.length === entityNames.length * 4;

    return {
      name: role.name,
      isAdmin,
      permissions: entries,
    };
  });

  return {
    roles: roleDefinitions,
    entities: entityNames,
    matrix: matrixData,
  };
}
