import { z } from 'zod';
import { llmCall } from '@nexus/llm';
import { storage } from '@nexus/storage';
import {
  LLMParseError,
  LLMRefusalError,
  LLMTimeoutError,
  ContextOverflowError,
  HallucinationError,
  InsufficientDataError,
} from '@nexus/contracts/errors';
import { OntologyNode, OntologyRelationship } from '@nexus/contracts/ontology';
import type { NormalisedEntity } from '@nexus/contracts/entities';
import {
  type SourceChunk,
  type ExtractedEntity,
  type InferredRelationship,
  type HierarchyEntry,
  Stage1OutputSchema,
  DeduplicationResultSchema,
  Stage3OutputSchema,
  Stage4OutputSchema,
  ExtractedEntitySchema,
} from '../types.js';

// ── Constants ─────────────────────────────────────────────────────

const MAX_ENTITIES_PER_CHUNK = 200;
const MIN_ENTITIES_FOR_EXTRACTION = 3;

// ── Stage 1: Per-source Entity Extraction (Sonnet) ────────────────

const STAGE1_SYSTEM_PROMPT = `You are an expert business analyst extracting structured entities from raw business data.

TASK: Analyse the provided normalised entities from a single data source and extract refined ontology entities with accurate types, properties, and confidence scores.

RULES:
1. Each entity must have a clear entityType from: person, company, department, role, transaction, invoice, product, service, document, communication, project, case, supplier, customer, employee, tool, process.
2. Assign a confidence score (0.0-1.0) based on data quality and completeness:
   - 0.9-1.0: Complete data, clear identification, strong evidence
   - 0.7-0.89: Good data, minor gaps, reasonable inference
   - 0.5-0.69: Partial data, moderate inference required
   - Below 0.5: Weak data, significant inference, flag for review
3. Preserve the source entity IDs for provenance tracking.
4. Extract department affiliation when detectable.
5. Consolidate duplicate entities from the same source (same name + type = merge).
6. Properties should contain business-relevant attributes only.

OUTPUT FORMAT: JSON object matching the schema exactly.

EXAMPLE OUTPUT:
{
  "entities": [
    {
      "id": "ext-001",
      "entityType": "employee",
      "name": "Jane Smith",
      "description": "Senior Developer in Engineering",
      "properties": {"title": "Senior Developer", "email": "jane@company.com"},
      "confidence": 0.92,
      "sourceEntityIds": ["src-entity-123", "src-entity-456"],
      "department": "Engineering"
    }
  ],
  "sourceSystem": "google-workspace"
}`;

export async function extractEntitiesFromSource(
  orgId: string,
  chunk: SourceChunk,
): Promise<ExtractedEntity[]> {
  if (chunk.entities.length < MIN_ENTITIES_FOR_EXTRACTION) {
    throw new InsufficientDataError(
      `Source ${chunk.sourceSystem} has only ${chunk.entities.length} entities, minimum ${MIN_ENTITIES_FOR_EXTRACTION} required`,
      { orgId },
    );
  }

  // Chunk large sources to avoid context overflow
  const entityChunks = chunkArray(chunk.entities, MAX_ENTITIES_PER_CHUNK);
  const allExtracted: ExtractedEntity[] = [];

  for (const entityBatch of entityChunks) {
    try {
      const result = await llmCall(
        {
          model: 'sonnet',
          systemPrompt: STAGE1_SYSTEM_PROMPT,
          inputSchema: z.object({
            sourceSystem: z.string(),
            entities: z.array(z.object({
              id: z.string(),
              entityType: z.string(),
              name: z.string(),
              properties: z.record(z.unknown()),
              confidence: z.number(),
            })),
          }),
          outputSchema: Stage1OutputSchema,
          sanitise: true,
          orgId,
        },
        {
          sourceSystem: chunk.sourceSystem,
          entities: entityBatch.map((e) => ({
            id: e.id,
            entityType: e.entityType,
            name: e.name,
            properties: e.properties,
            confidence: e.confidence,
          })),
        },
      );

      allExtracted.push(...result.data.entities);
    } catch (error) {
      rethrowAsOntologyError(error, orgId, `Stage 1 extraction for ${chunk.sourceSystem}`);
    }
  }

  return allExtracted;
}

// ── Stage 2: Cross-source Deduplication (Sonnet) ──────────────────

const STAGE2_SYSTEM_PROMPT = `You are an expert data deduplication analyst working with business entity data from multiple systems.

TASK: Compare entities extracted from different data sources and identify duplicates that should be merged.

RULES:
1. Two entities are duplicates if they represent the same real-world entity across different systems.
2. Match on: exact name match, fuzzy name match (nicknames, abbreviations), email match, ID cross-references.
3. Only merge entities of compatible types (e.g., "employee" and "person" can merge, but "employee" and "department" cannot).
4. When merging, keep the entity with higher confidence as the primary. Combine properties from both.
5. Assign a confidence score to each merge decision.
6. Generate a new unique ID for merged entities using format "merged-{index}".
7. Preserve ALL source entity IDs in the merged entity's sourceEntityIds array.

OUTPUT FORMAT: JSON object with deduplicated entities and a merge log.

EXAMPLE OUTPUT:
{
  "entities": [
    {
      "id": "merged-001",
      "entityType": "employee",
      "name": "Jane Smith",
      "description": "Senior Developer, Engineering dept",
      "properties": {"title": "Senior Developer", "email": "jane@company.com", "slackHandle": "@jsmith"},
      "confidence": 0.95,
      "sourceEntityIds": ["ext-001", "ext-042"],
      "department": "Engineering"
    }
  ],
  "merges": [
    {
      "keptId": "merged-001",
      "mergedIds": ["ext-001", "ext-042"],
      "reason": "Same person: matching email jane@company.com across Google Workspace and Slack",
      "confidence": 0.95
    }
  ]
}`;

export async function deduplicateEntities(
  orgId: string,
  allEntities: ExtractedEntity[],
): Promise<ExtractedEntity[]> {
  if (allEntities.length === 0) return [];

  // For small sets, process in one call
  if (allEntities.length <= MAX_ENTITIES_PER_CHUNK) {
    return runDeduplication(orgId, allEntities);
  }

  // For large sets, deduplicate in windows then cross-deduplicate
  const chunks = chunkArray(allEntities, MAX_ENTITIES_PER_CHUNK);
  let accumulated: ExtractedEntity[] = [];

  for (const chunk of chunks) {
    const combined = [...accumulated, ...chunk];
    accumulated = await runDeduplication(orgId, combined);
  }

  return accumulated;
}

async function runDeduplication(
  orgId: string,
  entities: ExtractedEntity[],
): Promise<ExtractedEntity[]> {
  try {
    const result = await llmCall(
      {
        model: 'sonnet',
        systemPrompt: STAGE2_SYSTEM_PROMPT,
        inputSchema: z.object({
          entities: z.array(ExtractedEntitySchema),
        }),
        outputSchema: DeduplicationResultSchema,
        sanitise: true,
        orgId,
      },
      { entities },
    );

    return result.data.entities;
  } catch (error) {
    rethrowAsOntologyError(error, orgId, 'Stage 2 deduplication');
  }
}

// ── Stage 3: Relationship Inference (Opus) ────────────────────────

const STAGE3_SYSTEM_PROMPT = `You are an expert knowledge graph architect inferring relationships between business entities.

TASK: Analyse the provided entities and infer meaningful relationships between them using co-occurrence patterns, naming conventions, property overlaps, and business logic reasoning.

RELATIONSHIP TYPES to consider:
- WORKS_IN: person/employee -> department
- REPORTS_TO: person/employee -> person/employee (manager)
- MANAGES: person/employee -> department/team/project
- USES: person/department -> tool/service
- OWNS: person/department -> document/product
- SUPPLIES: supplier -> product/service
- PURCHASES_FROM: company -> supplier
- PART_OF: department -> company, team -> department
- COMMUNICATES_WITH: person <-> person (from email/chat patterns)
- WORKS_ON: person -> project/case
- CREATED: person -> document
- PROVIDES: company -> service/product
- ASSIGNED_TO: case/project -> person

RULES:
1. Every relationship must have a clear evidence trail explaining WHY it was inferred.
2. Confidence scoring:
   - 0.9-1.0: Explicit data (e.g., HR record shows department membership)
   - 0.7-0.89: Strong inference (e.g., email domain matches company)
   - 0.5-0.69: Moderate inference (e.g., co-occurrence in multiple contexts)
   - Below 0.5: Weak inference, flag for human review
3. Do NOT hallucinate relationships without evidence. If uncertain, lower the confidence.
4. Generate unique IDs for relationships using format "rel-{index}".
5. Properties should contain relationship-specific metadata (frequency, last_observed, etc.).

OUTPUT FORMAT: JSON object with inferred relationships.

EXAMPLE OUTPUT:
{
  "relationships": [
    {
      "id": "rel-001",
      "type": "WORKS_IN",
      "sourceEntityId": "merged-001",
      "targetEntityId": "merged-015",
      "properties": {"since": "2023-01", "role": "Senior Developer"},
      "confidence": 0.92,
      "evidence": ["HR record lists Engineering department", "Email domain matches eng team DL"],
      "reasoning": "Jane Smith's HR record explicitly lists Engineering as her department, confirmed by her presence on the engineering team distribution list."
    }
  ]
}`;

export async function inferRelationships(
  orgId: string,
  entities: ExtractedEntity[],
): Promise<InferredRelationship[]> {
  if (entities.length < 2) return [];

  // Process in batches to stay within context limits
  const entityChunks = chunkArray(entities, 100);
  const allRelationships: InferredRelationship[] = [];
  const seenPairs = new Set<string>();

  for (let i = 0; i < entityChunks.length; i++) {
    // Intra-chunk relationships
    const intraRels = await runRelationshipInference(orgId, entityChunks[i]!);
    for (const rel of intraRels) {
      const pairKey = [rel.sourceEntityId, rel.targetEntityId].sort().join('::');
      if (!seenPairs.has(pairKey)) {
        seenPairs.add(pairKey);
        allRelationships.push(rel);
      }
    }

    // Cross-chunk relationships (compare current chunk with all previous)
    for (let j = 0; j < i; j++) {
      const crossEntities = [...entityChunks[i]!, ...entityChunks[j]!];
      const crossRels = await runRelationshipInference(orgId, crossEntities);
      for (const rel of crossRels) {
        const pairKey = [rel.sourceEntityId, rel.targetEntityId].sort().join('::');
        if (!seenPairs.has(pairKey)) {
          seenPairs.add(pairKey);
          allRelationships.push(rel);
        }
      }
    }
  }

  return allRelationships;
}

async function runRelationshipInference(
  orgId: string,
  entities: ExtractedEntity[],
): Promise<InferredRelationship[]> {
  try {
    const result = await llmCall(
      {
        model: 'opus',
        systemPrompt: STAGE3_SYSTEM_PROMPT,
        inputSchema: z.object({
          entities: z.array(ExtractedEntitySchema),
        }),
        outputSchema: Stage3OutputSchema,
        sanitise: true,
        orgId,
      },
      { entities },
    );

    // Validate that all referenced entity IDs exist
    const entityIds = new Set(entities.map((e) => e.id));
    const validRelationships = result.data.relationships.filter((rel) => {
      const sourceExists = entityIds.has(rel.sourceEntityId);
      const targetExists = entityIds.has(rel.targetEntityId);
      if (!sourceExists || !targetExists) {
        console.warn(
          `[ontology-engine] Hallucinated relationship ${rel.id}: ` +
          `source=${rel.sourceEntityId} (${sourceExists ? 'valid' : 'MISSING'}), ` +
          `target=${rel.targetEntityId} (${targetExists ? 'valid' : 'MISSING'})`,
        );
        return false;
      }
      return true;
    });

    return validRelationships;
  } catch (error) {
    rethrowAsOntologyError(error, orgId, 'Stage 3 relationship inference');
  }
}

// ── Stage 4: Hierarchy Detection (Opus) ───────────────────────────

const STAGE4_SYSTEM_PROMPT = `You are an expert organisational analyst detecting hierarchical structures within business entities.

TASK: Analyse entities and their properties to infer organisational hierarchies, department structures, and reporting lines.

HIERARCHY TYPES:
1. Organisational: Company -> Division -> Department -> Team -> Individual
2. Departmental: Department Head -> Managers -> Team Leads -> Staff
3. Project: Project Owner -> Project Manager -> Contributors
4. Document: Folder/Category -> Sub-category -> Individual Documents

RULES:
1. Use HR data (titles, roles) as the primary signal for org hierarchy.
2. Use email patterns (CC chains, approval flows) as secondary signals.
3. Use document ownership/folder structures for document hierarchy.
4. Every hierarchy entry must reference valid entity IDs from the input.
5. Assign hierarchy levels (0 = root, incrementing down).
6. Also assign department affiliations where detectable.
7. Confidence scoring:
   - 0.9-1.0: Explicit org chart data
   - 0.7-0.89: Strong title/role inference (e.g., "VP of Engineering" > "Senior Engineer")
   - 0.5-0.69: Pattern-based inference (email CC patterns, meeting attendees)
   - Below 0.5: Weak inference, needs human review

OUTPUT FORMAT: JSON object with hierarchy entries and department assignments.

EXAMPLE OUTPUT:
{
  "hierarchies": [
    {
      "entityId": "merged-001",
      "parentEntityId": "merged-015",
      "hierarchyLevel": 2,
      "hierarchyType": "organisational",
      "confidence": 0.88,
      "evidence": ["Title 'Senior Developer' reports to 'Engineering Manager'", "CC'd on approval emails from merged-015"]
    }
  ],
  "departmentAssignments": [
    {
      "entityId": "merged-001",
      "department": "Engineering",
      "confidence": 0.95
    }
  ]
}`;

export async function detectHierarchies(
  orgId: string,
  entities: ExtractedEntity[],
  relationships: InferredRelationship[],
): Promise<{
  hierarchies: HierarchyEntry[];
  departmentAssignments: Array<{ entityId: string; department: string; confidence: number }>;
}> {
  if (entities.length < 2) {
    return { hierarchies: [], departmentAssignments: [] };
  }

  try {
    const result = await llmCall(
      {
        model: 'opus',
        systemPrompt: STAGE4_SYSTEM_PROMPT,
        inputSchema: z.object({
          entities: z.array(ExtractedEntitySchema),
          relationships: z.array(z.object({
            id: z.string(),
            type: z.string(),
            sourceEntityId: z.string(),
            targetEntityId: z.string(),
            confidence: z.number(),
          })),
        }),
        outputSchema: Stage4OutputSchema,
        sanitise: true,
        orgId,
      },
      {
        entities,
        relationships: relationships.map((r) => ({
          id: r.id,
          type: r.type,
          sourceEntityId: r.sourceEntityId,
          targetEntityId: r.targetEntityId,
          confidence: r.confidence,
        })),
      },
    );

    // Validate entity references
    const entityIds = new Set(entities.map((e) => e.id));
    const validHierarchies = result.data.hierarchies.filter((h) => {
      if (!entityIds.has(h.entityId)) {
        console.warn(`[ontology-engine] Hierarchy references missing entity: ${h.entityId}`);
        return false;
      }
      if (h.parentEntityId && !entityIds.has(h.parentEntityId)) {
        console.warn(`[ontology-engine] Hierarchy references missing parent: ${h.parentEntityId}`);
        return false;
      }
      return true;
    });

    const validDeptAssignments = result.data.departmentAssignments.filter((da) => {
      if (!entityIds.has(da.entityId)) {
        console.warn(`[ontology-engine] Department assignment references missing entity: ${da.entityId}`);
        return false;
      }
      return true;
    });

    return {
      hierarchies: validHierarchies,
      departmentAssignments: validDeptAssignments,
    };
  } catch (error) {
    rethrowAsOntologyError(error, orgId, 'Stage 4 hierarchy detection');
  }
}

// ── Full Pipeline ─────────────────────────────────────────────────

export interface ExtractionResult {
  nodes: OntologyNode[];
  relationships: OntologyRelationship[];
  version: string;
}

export async function runExtractionPipeline(
  orgId: string,
  onProgress?: (stage: string, progress: number) => void,
): Promise<ExtractionResult> {
  const version = `v${Date.now()}`;

  // Load normalised entities from S3
  onProgress?.('loading', 0);
  const entityFiles = await storage.list(orgId, 'entities');
  if (entityFiles.length === 0) {
    throw new InsufficientDataError(
      'No normalised entities found in storage. Has Module 1 completed ingestion?',
      { orgId },
    );
  }

  const allEntities: NormalisedEntity[] = [];
  for (const file of entityFiles) {
    const data = await storage.getJSON<NormalisedEntity[]>(orgId, 'entities', file);
    if (data) allEntities.push(...data);
  }

  if (allEntities.length < MIN_ENTITIES_FOR_EXTRACTION) {
    throw new InsufficientDataError(
      `Only ${allEntities.length} entities found, minimum ${MIN_ENTITIES_FOR_EXTRACTION} required`,
      { orgId },
    );
  }

  // Group by source system
  const bySource = new Map<string, NormalisedEntity[]>();
  for (const entity of allEntities) {
    const existing = bySource.get(entity.sourceSystem) ?? [];
    existing.push(entity);
    bySource.set(entity.sourceSystem, existing);
  }

  // Stage 1: Per-source extraction
  onProgress?.('extraction', 10);
  const stage1Results: ExtractedEntity[] = [];
  const sourceEntries = Array.from(bySource.entries());

  for (let i = 0; i < sourceEntries.length; i++) {
    const [sourceSystem, entities] = sourceEntries[i]!;
    const extracted = await extractEntitiesFromSource(orgId, { sourceSystem, entities });
    stage1Results.push(...extracted);
    onProgress?.('extraction', 10 + Math.round((i / sourceEntries.length) * 20));
  }

  // Stage 2: Cross-source deduplication
  onProgress?.('deduplication', 30);
  const deduplicatedEntities = await deduplicateEntities(orgId, stage1Results);
  onProgress?.('deduplication', 50);

  // Stage 3: Relationship inference
  onProgress?.('relationships', 50);
  const relationships = await inferRelationships(orgId, deduplicatedEntities);
  onProgress?.('relationships', 70);

  // Stage 4: Hierarchy detection
  onProgress?.('hierarchy', 70);
  const { hierarchies, departmentAssignments } = await detectHierarchies(
    orgId,
    deduplicatedEntities,
    relationships,
  );
  onProgress?.('hierarchy', 90);

  // Apply hierarchy data to entities
  const hierarchyMap = new Map(hierarchies.map((h) => [h.entityId, h]));
  const deptMap = new Map(departmentAssignments.map((da) => [da.entityId, da]));

  const ontologyNodes: OntologyNode[] = deduplicatedEntities.map((entity) => {
    const hierarchy = hierarchyMap.get(entity.id);
    const deptAssignment = deptMap.get(entity.id);

    return {
      id: entity.id,
      orgId,
      label: entity.entityType.charAt(0).toUpperCase() + entity.entityType.slice(1),
      entityType: entity.entityType,
      name: entity.name,
      description: entity.description,
      properties: entity.properties,
      confidence: entity.confidence,
      sourceEntities: entity.sourceEntityIds,
      department: deptAssignment?.department ?? entity.department,
      hierarchyLevel: hierarchy?.hierarchyLevel,
    };
  });

  const ontologyRelationships: OntologyRelationship[] = relationships.map((rel) => ({
    id: rel.id,
    orgId,
    type: rel.type,
    sourceNodeId: rel.sourceEntityId,
    targetNodeId: rel.targetEntityId,
    properties: rel.properties,
    confidence: rel.confidence,
    evidence: rel.evidence,
  }));

  // Add hierarchy relationships
  for (const hierarchy of hierarchies) {
    if (hierarchy.parentEntityId) {
      ontologyRelationships.push({
        id: `hier-${hierarchy.entityId}-${hierarchy.parentEntityId}`,
        orgId,
        type: hierarchy.hierarchyType === 'organisational' ? 'REPORTS_TO' : 'PART_OF',
        sourceNodeId: hierarchy.entityId,
        targetNodeId: hierarchy.parentEntityId,
        properties: {
          hierarchyType: hierarchy.hierarchyType,
          hierarchyLevel: hierarchy.hierarchyLevel,
        },
        confidence: hierarchy.confidence,
        evidence: hierarchy.evidence,
      });
    }
  }

  // Persist extraction results to S3 for audit
  await storage.putJSON(orgId, 'ontology', `${version}-nodes.json`, ontologyNodes);
  await storage.putJSON(orgId, 'ontology', `${version}-relationships.json`, ontologyRelationships);

  onProgress?.('complete', 100);

  return {
    nodes: ontologyNodes,
    relationships: ontologyRelationships,
    version,
  };
}

// ── Helpers ───────────────────────────────────────────────────────

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function rethrowAsOntologyError(error: unknown, orgId: string, context: string): never {
  if (error instanceof LLMParseError) throw error;
  if (error instanceof LLMRefusalError) throw error;
  if (error instanceof LLMTimeoutError) throw error;
  if (error instanceof ContextOverflowError) throw error;
  if (error instanceof HallucinationError) throw error;
  if (error instanceof InsufficientDataError) throw error;

  const err = error as Error;

  if (err.name === 'RefusalError') {
    throw new LLMRefusalError(`LLM refused during ${context}: ${err.message}`, { orgId, cause: err });
  }
  if (err.name === 'ParseError') {
    throw new LLMParseError(`LLM output parse failed during ${context}: ${err.message}`, { orgId, cause: err });
  }
  if (err.message?.includes('context_length') || err.message?.includes('too many tokens')) {
    throw new ContextOverflowError(`Context overflow during ${context}: ${err.message}`, { orgId, cause: err });
  }
  if (err.message?.includes('timeout') || err.message?.includes('ETIMEDOUT')) {
    throw new LLMTimeoutError(`LLM timeout during ${context}: ${err.message}`, { orgId, cause: err });
  }

  throw new LLMParseError(`Unexpected error during ${context}: ${err.message}`, { orgId, cause: err });
}
