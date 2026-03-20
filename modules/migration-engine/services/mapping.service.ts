import { z } from 'zod';
import { graph } from '@nexus/graph';
import { storage } from '@nexus/storage';
import { llmCall } from '@nexus/llm';
import { AmbiguousMappingError } from '@nexus/contracts/errors';
import type {
  FieldMapping,
  MappingSet,
  TargetSchema,
  TargetEntitySchema,
  TargetFieldSchema,
  TransformationRule,
  SemanticMappingInput,
  SemanticMappingOutput,
} from '../types.js';

// ── Constants ───────────────────────────────────────────────────

const HIGH_CONFIDENCE_THRESHOLD = 0.85;
const MEDIUM_CONFIDENCE_THRESHOLD = 0.6;
const AMBIGUOUS_THRESHOLD = 0.4;

// ── Mapping Service ─────────────────────────────────────────────

export class MappingService {
  /**
   * Generate field mappings from ontology source schemas to target schemas.
   * Uses exact name matching first, then type compatibility, then LLM-assisted
   * semantic matching for remaining unmapped fields.
   */
  async generateMappings(
    orgId: string,
    migrationId: string,
    targetSchema: TargetSchema,
  ): Promise<MappingSet[]> {
    // Read source entity schemas from the ontology
    const ontology = await graph.ontology.read(orgId, { depth: 1 });
    const sourceEntities = this.extractSourceSchemas(ontology.nodes);

    const mappingSets: MappingSet[] = [];

    for (const targetEntity of targetSchema.entities) {
      // Find matching source entity types
      const matchingSources = this.findMatchingSourceEntities(sourceEntities, targetEntity);

      for (const source of matchingSources) {
        const mappings: FieldMapping[] = [];
        const unmappedSourceFields: string[] = [];
        const unmappedTargetFields: string[] = [];

        const sourceFieldNames = Object.keys(source.fields);
        const targetFieldNames = targetEntity.fields.map((f) => f.name);

        const mappedSourceFields = new Set<string>();
        const mappedTargetFields = new Set<string>();

        // Pass 1: Exact name match
        for (const sourceField of sourceFieldNames) {
          const normalised = this.normaliseFieldName(sourceField);
          for (const targetField of targetEntity.fields) {
            const targetNorm = this.normaliseFieldName(targetField.name);
            if (normalised === targetNorm && !mappedTargetFields.has(targetField.name)) {
              const typeCompat = this.checkTypeCompatibility(
                source.fields[sourceField],
                targetField.type,
              );
              const confidence = typeCompat ? 0.95 : 0.75;
              mappings.push(this.createFieldMapping(
                sourceField,
                source.entityType,
                targetField.name,
                targetEntity.entityType,
                confidence,
                'exact_name',
                typeCompat ? [] : [this.suggestTypeTransformation(source.fields[sourceField], targetField.type)],
              ));
              mappedSourceFields.add(sourceField);
              mappedTargetFields.add(targetField.name);
              break;
            }
          }
        }

        // Pass 2: Type compatibility for remaining fields
        for (const sourceField of sourceFieldNames) {
          if (mappedSourceFields.has(sourceField)) continue;
          for (const targetField of targetEntity.fields) {
            if (mappedTargetFields.has(targetField.name)) continue;
            const sourceType = source.fields[sourceField];
            if (this.checkTypeCompatibility(sourceType, targetField.type)) {
              const nameSimilarity = this.computeNameSimilarity(sourceField, targetField.name);
              if (nameSimilarity > 0.5) {
                mappings.push(this.createFieldMapping(
                  sourceField,
                  source.entityType,
                  targetField.name,
                  targetEntity.entityType,
                  Math.min(0.7, nameSimilarity),
                  'type_compatible',
                  [],
                ));
                mappedSourceFields.add(sourceField);
                mappedTargetFields.add(targetField.name);
                break;
              }
            }
          }
        }

        // Pass 3: LLM-assisted semantic matching for remaining fields
        const remainingSource = sourceFieldNames.filter((f) => !mappedSourceFields.has(f));
        const remainingTarget = targetEntity.fields.filter((f) => !mappedTargetFields.has(f.name));

        if (remainingSource.length > 0 && remainingTarget.length > 0) {
          const semanticMappings = await this.semanticMatch(
            orgId,
            source,
            remainingSource,
            remainingTarget,
            targetEntity.entityType,
          );
          for (const sm of semanticMappings) {
            if (sm.confidence >= AMBIGUOUS_THRESHOLD) {
              mappings.push(sm);
              mappedSourceFields.add(sm.sourceField);
              mappedTargetFields.add(sm.targetField);
            }
          }
        }

        // Collect unmapped fields
        for (const sf of sourceFieldNames) {
          if (!mappedSourceFields.has(sf)) unmappedSourceFields.push(sf);
        }
        for (const tf of targetFieldNames) {
          if (!mappedTargetFields.has(tf)) unmappedTargetFields.push(tf);
        }

        // Compute overall confidence
        const overallConfidence = mappings.length > 0
          ? mappings.reduce((sum, m) => sum + m.confidence, 0) / mappings.length
          : 0;

        const now = new Date().toISOString();
        mappingSets.push({
          id: `ms-${migrationId}-${source.entityType}-${targetEntity.entityType}`,
          migrationId,
          orgId,
          sourceEntityType: source.entityType,
          targetEntityType: targetEntity.entityType,
          mappings,
          unmappedSourceFields,
          unmappedTargetFields,
          overallConfidence,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    return mappingSets;
  }

  /**
   * Flag ambiguous mappings that need human review.
   */
  flagAmbiguousMappings(mappingSets: MappingSet[]): FieldMapping[] {
    const ambiguous: FieldMapping[] = [];
    for (const set of mappingSets) {
      for (const mapping of set.mappings) {
        if (
          mapping.confidence < HIGH_CONFIDENCE_THRESHOLD &&
          mapping.confidence >= AMBIGUOUS_THRESHOLD &&
          !mapping.approved
        ) {
          ambiguous.push(mapping);
        }
      }
    }
    return ambiguous;
  }

  /**
   * Validate that all required target fields are mapped.
   */
  validateMappingCompleteness(
    mappingSets: MappingSet[],
    targetSchema: TargetSchema,
  ): Array<{ entityType: string; field: string; message: string }> {
    const issues: Array<{ entityType: string; field: string; message: string }> = [];

    for (const entity of targetSchema.entities) {
      const relevantSets = mappingSets.filter((s) => s.targetEntityType === entity.entityType);
      const mappedTargetFields = new Set(
        relevantSets.flatMap((s) => s.mappings.map((m) => m.targetField)),
      );

      for (const field of entity.fields) {
        if (field.required && !mappedTargetFields.has(field.name) && field.defaultValue === undefined) {
          issues.push({
            entityType: entity.entityType,
            field: field.name,
            message: `Required field "${field.name}" on "${entity.entityType}" has no mapping and no default value`,
          });
        }
      }
    }

    return issues;
  }

  /**
   * Apply manual mapping adjustments from the user.
   */
  applyMappingAdjustments(
    mappingSets: MappingSet[],
    adjustments: Array<{
      mappingSetId: string;
      mappingId: string;
      action: 'approve' | 'reject' | 'remap';
      newTargetField?: string;
      transformations?: TransformationRule[];
    }>,
  ): MappingSet[] {
    const setsMap = new Map(mappingSets.map((s) => [s.id, { ...s, mappings: [...s.mappings] }]));

    for (const adj of adjustments) {
      const set = setsMap.get(adj.mappingSetId);
      if (!set) continue;

      const mappingIdx = set.mappings.findIndex((m) => m.id === adj.mappingId);
      if (mappingIdx === -1) continue;

      switch (adj.action) {
        case 'approve':
          set.mappings[mappingIdx] = {
            ...set.mappings[mappingIdx],
            approved: true,
            confidenceLevel: 'manual',
          };
          break;
        case 'reject':
          set.unmappedSourceFields.push(set.mappings[mappingIdx].sourceField);
          set.unmappedTargetFields.push(set.mappings[mappingIdx].targetField);
          set.mappings.splice(mappingIdx, 1);
          break;
        case 'remap':
          if (adj.newTargetField) {
            set.mappings[mappingIdx] = {
              ...set.mappings[mappingIdx],
              targetField: adj.newTargetField,
              confidence: 1.0,
              confidenceLevel: 'manual',
              matchMethod: 'manual',
              approved: true,
              transformations: adj.transformations ?? set.mappings[mappingIdx].transformations,
            };
          }
          break;
      }

      set.updatedAt = new Date().toISOString();
      set.overallConfidence = set.mappings.length > 0
        ? set.mappings.reduce((sum, m) => sum + m.confidence, 0) / set.mappings.length
        : 0;
    }

    return Array.from(setsMap.values());
  }

  // ── Private methods ─────────────────────────────────────────────

  private extractSourceSchemas(
    nodes: Array<{ entityType: string; properties: Record<string, unknown>; name: string }>,
  ): Array<{ entityType: string; fields: Record<string, string>; sampleData: Record<string, unknown> }> {
    const schemaMap = new Map<string, { fields: Record<string, string>; sampleData: Record<string, unknown> }>();

    for (const node of nodes) {
      if (!schemaMap.has(node.entityType)) {
        schemaMap.set(node.entityType, { fields: {}, sampleData: {} });
      }
      const schema = schemaMap.get(node.entityType)!;
      for (const [key, value] of Object.entries(node.properties)) {
        if (!schema.fields[key]) {
          schema.fields[key] = typeof value as string;
          schema.sampleData[key] = value;
        }
      }
    }

    return Array.from(schemaMap.entries()).map(([entityType, data]) => ({
      entityType,
      ...data,
    }));
  }

  private findMatchingSourceEntities(
    sources: Array<{ entityType: string; fields: Record<string, string>; sampleData: Record<string, unknown> }>,
    targetEntity: TargetEntitySchema,
  ): Array<{ entityType: string; fields: Record<string, string>; sampleData: Record<string, unknown> }> {
    // Match by entity type name similarity
    return sources.filter((source) => {
      const sim = this.computeNameSimilarity(
        source.entityType.toLowerCase(),
        targetEntity.entityType.toLowerCase(),
      );
      return sim > 0.3;
    });
  }

  private normaliseFieldName(name: string): string {
    return name
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .replace(/[-\s.]+/g, '_')
      .toLowerCase()
      .replace(/^_+|_+$/g, '');
  }

  private checkTypeCompatibility(sourceType: string, targetType: string): boolean {
    const compatMap: Record<string, string[]> = {
      string: ['string', 'enum', 'date', 'datetime'],
      number: ['number', 'string'],
      boolean: ['boolean', 'number', 'string'],
      object: ['json'],
      date: ['date', 'datetime', 'string'],
      datetime: ['datetime', 'date', 'string'],
    };
    const sourceNorm = sourceType.toLowerCase();
    const compatible = compatMap[sourceNorm];
    return compatible ? compatible.includes(targetType.toLowerCase()) : sourceNorm === targetType.toLowerCase();
  }

  private suggestTypeTransformation(sourceType: string, targetType: string): TransformationRule {
    return {
      type: 'type_cast',
      params: { from: sourceType, to: targetType },
    };
  }

  private computeNameSimilarity(a: string, b: string): number {
    const normA = this.normaliseFieldName(a);
    const normB = this.normaliseFieldName(b);
    if (normA === normB) return 1.0;

    // Levenshtein-based similarity
    const maxLen = Math.max(normA.length, normB.length);
    if (maxLen === 0) return 1.0;
    const distance = this.levenshtein(normA, normB);
    return 1 - distance / maxLen;
  }

  private levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }
    return dp[m][n];
  }

  private async semanticMatch(
    orgId: string,
    source: { entityType: string; fields: Record<string, string>; sampleData: Record<string, unknown> },
    remainingSourceFields: string[],
    remainingTargetFields: TargetFieldSchema[],
    targetEntityType: string,
  ): Promise<FieldMapping[]> {
    const input: SemanticMappingInput = {
      sourceFields: remainingSourceFields.map((name) => ({
        name,
        sampleValues: source.sampleData[name] !== undefined ? [source.sampleData[name]] : [],
        inferredType: source.fields[name],
      })),
      targetFields: remainingTargetFields.map((f) => ({
        name: f.name,
        type: f.type,
        description: f.pattern ? `Pattern: ${f.pattern}` : undefined,
      })),
      entityContext: `Mapping ${source.entityType} fields to ${targetEntityType} fields in a business data migration`,
    };

    const result = await llmCall(
      {
        model: 'sonnet',
        systemPrompt: `You are a data migration field mapping expert. Given source fields (with sample values and types) and target fields (with types and descriptions), determine the best mapping between them.

For each mapping, provide:
- sourceField: exact source field name
- targetField: exact target field name
- confidence: 0-1 score (1 = certain match, 0.5 = plausible, below 0.4 = uncertain)
- reasoning: brief explanation
- suggestedTransformation: if types differ, suggest a transformation (e.g. "parse_date", "to_number", "concatenate")

Only map fields you're reasonably confident about. Return empty mappings array if nothing matches well.`,
        inputSchema: z.object({
          sourceFields: z.array(z.object({
            name: z.string(),
            sampleValues: z.array(z.unknown()).optional(),
            inferredType: z.string().optional(),
          })),
          targetFields: z.array(z.object({
            name: z.string(),
            type: z.string(),
            description: z.string().optional(),
          })),
          entityContext: z.string(),
        }),
        outputSchema: z.object({
          mappings: z.array(z.object({
            sourceField: z.string(),
            targetField: z.string(),
            confidence: z.number().min(0).max(1),
            reasoning: z.string(),
            suggestedTransformation: z.string().optional(),
          })),
        }),
        sanitise: true,
        orgId,
      },
      input,
    );

    return result.data.mappings.map((m) => {
      const confidenceLevel = m.confidence >= HIGH_CONFIDENCE_THRESHOLD
        ? 'high' as const
        : m.confidence >= MEDIUM_CONFIDENCE_THRESHOLD
          ? 'medium' as const
          : 'low' as const;

      const transformations: TransformationRule[] = [];
      if (m.suggestedTransformation) {
        transformations.push({
          type: 'type_cast',
          params: { method: m.suggestedTransformation, reasoning: m.reasoning },
        });
      }

      return {
        id: `fm-${source.entityType}-${m.sourceField}-${m.targetField}`,
        sourceField: m.sourceField,
        sourceEntityType: source.entityType,
        targetField: m.targetField,
        targetEntityType,
        confidence: m.confidence,
        confidenceLevel,
        matchMethod: 'semantic' as const,
        transformations,
        approved: false,
        notes: m.reasoning,
      };
    });
  }

  private createFieldMapping(
    sourceField: string,
    sourceEntityType: string,
    targetField: string,
    targetEntityType: string,
    confidence: number,
    matchMethod: FieldMapping['matchMethod'],
    transformations: TransformationRule[],
  ): FieldMapping {
    const confidenceLevel = confidence >= HIGH_CONFIDENCE_THRESHOLD
      ? 'high' as const
      : confidence >= MEDIUM_CONFIDENCE_THRESHOLD
        ? 'medium' as const
        : 'low' as const;

    return {
      id: `fm-${sourceEntityType}-${sourceField}-${targetField}`,
      sourceField,
      sourceEntityType,
      targetField,
      targetEntityType,
      confidence,
      confidenceLevel,
      matchMethod,
      transformations,
      approved: confidence >= HIGH_CONFIDENCE_THRESHOLD,
    };
  }
}

export const mappingService = new MappingService();
