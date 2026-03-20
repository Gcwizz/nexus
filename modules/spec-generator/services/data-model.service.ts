import { llmCall } from '@nexus/llm';
import {
  DataModelInput,
  DataModelOutput,
  type EntityDefinition,
  type ModuleDefinition,
} from '../types.js';
import { DataModelGenerationError } from '../errors.js';

// ── Prompts ─────────────────────────────────────────────────────

const DATA_MODEL_SYSTEM_PROMPT = `You are an expert database architect. Your task is to generate a comprehensive entity-relationship data model for a specific software module based on its business processes and the organisation's ontology.

Given:
- The module name and department
- Process definitions showing what data flows through the system
- Ontology nodes (business entities) and their relationships

You must:

1. **Infer entities** from the ontology nodes and process data flows. Each entity needs:
   - A descriptive name in PascalCase
   - All relevant fields with appropriate types

2. **Determine field types** using Drizzle-compatible types:
   - text, integer, real, boolean, timestamp, jsonb, uuid
   - Add appropriate constraints: notNull, unique, primaryKey, default values, references

3. **Map relationships** between entities:
   - one-to-one: e.g., User has one Profile
   - one-to-many: e.g., Department has many Employees
   - many-to-many: e.g., Student enrolled in many Courses (generates junction table)
   - Mark whether each relationship is required (foreign key NOT NULL)

4. **Include standard fields** on every entity:
   - id (text, primary key)
   - createdAt (timestamp, default now)
   - updatedAt (timestamp, default now)
   - orgId (text, foreign key to organisations)

5. **Add validation constraints** as string descriptions:
   - "min:1" for minimum length
   - "max:255" for maximum length
   - "email" for email validation
   - "positive" for positive numbers
   - "enum:value1,value2,value3" for enumerated values

Output a JSON object with an "entities" array. Each entity has name, fields (array of {name, type, required, constraints}), and relationships (array of {target, type, required}).

Be thorough — include ALL entities implied by the processes. Don't miss junction tables for many-to-many relationships.`;

// ── Service ─────────────────────────────────────────────────────

export async function generateDataModel(
  orgId: string,
  module: ModuleDefinition,
  ontologyNodes: unknown[],
  ontologyRelationships: unknown[],
): Promise<EntityDefinition[]> {
  try {
    const result = await llmCall(
      {
        model: 'opus',
        systemPrompt: DATA_MODEL_SYSTEM_PROMPT,
        inputSchema: DataModelInput,
        outputSchema: DataModelOutput,
        sanitise: true,
        orgId,
      },
      {
        moduleName: module.name,
        department: module.department,
        processes: module.processes,
        ontologyNodes,
        ontologyRelationships,
      },
    );

    return result.data.entities.map((e) => ({
      name: e.name,
      fields: e.fields.map((f) => ({
        name: f.name,
        type: f.type,
        required: f.required,
        constraints: f.constraints ?? [],
      })),
      relationships: e.relationships,
    }));
  } catch (error) {
    throw new DataModelGenerationError(
      `Failed to generate data model for module "${module.name}" in org ${orgId}: ${(error as Error).message}`,
      { orgId, cause: error as Error },
    );
  }
}
