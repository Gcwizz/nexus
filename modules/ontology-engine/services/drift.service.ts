import { graph } from '@nexus/graph';
import { storage } from '@nexus/storage';
import type { OntologyNode, OntologyRelationship } from '@nexus/contracts/ontology';
import type { NormalisedEntity } from '@nexus/contracts/entities';
import type { DriftChange, DriftReport } from '../types.js';
import { publishDriftDetected } from '../events/producers.js';

// ── Drift Detection ───────────────────────────────────────────────

/**
 * Compare the current ontology against newly ingested entities to detect drift.
 * This supports the Living Digital Twin expansion — the ontology stays current
 * as incremental syncs bring in new data.
 */
export async function detectDrift(
  orgId: string,
  newEntityIds: string[],
): Promise<DriftReport> {
  // Load current ontology from Neo4j
  const { nodes: currentNodes, relationships: currentRelationships } = await graph.ontology.read(orgId);

  // Load new entities from S3
  const newEntities: NormalisedEntity[] = [];
  for (const entityId of newEntityIds) {
    const entity = await storage.getJSON<NormalisedEntity>(orgId, 'entities', `${entityId}.json`);
    if (entity) newEntities.push(entity);
  }

  // Also try loading from batch files
  if (newEntities.length === 0) {
    const entityFiles = await storage.list(orgId, 'entities');
    for (const file of entityFiles) {
      const data = await storage.getJSON<NormalisedEntity[]>(orgId, 'entities', file);
      if (data) {
        const filtered = data.filter((e) => newEntityIds.includes(e.id));
        newEntities.push(...filtered);
      }
    }
  }

  const changes: DriftChange[] = [];

  // Build lookup maps
  const currentNodesByName = new Map<string, OntologyNode>();
  const currentNodesBySourceEntity = new Map<string, OntologyNode>();
  for (const node of currentNodes) {
    currentNodesByName.set(normaliseKey(node.name, node.entityType), node);
    for (const sourceId of node.sourceEntities) {
      currentNodesBySourceEntity.set(sourceId, node);
    }
  }

  // Detect new entities not in current ontology
  for (const entity of newEntities) {
    const key = normaliseKey(entity.name, entity.entityType);
    const existingByName = currentNodesByName.get(key);
    const existingBySource = currentNodesBySourceEntity.get(entity.id);

    if (!existingByName && !existingBySource) {
      // New entity not in current ontology
      changes.push({
        type: 'entity_added',
        significance: classifyEntitySignificance(entity),
        entityId: entity.id,
        description: `New ${entity.entityType} detected: "${entity.name}" from ${entity.sourceSystem}`,
        newValue: {
          name: entity.name,
          entityType: entity.entityType,
          sourceSystem: entity.sourceSystem,
        },
      });
    } else {
      // Entity exists — check for property changes
      const existing = existingBySource ?? existingByName;
      if (existing) {
        const propertyChanges = detectPropertyChanges(existing.properties, entity.properties);
        if (propertyChanges.length > 0) {
          changes.push({
            type: 'entity_modified',
            significance: propertyChanges.length >= 3 ? 'high' : propertyChanges.length >= 1 ? 'medium' : 'low',
            entityId: existing.id,
            description: `${entity.entityType} "${entity.name}" has ${propertyChanges.length} property changes: ${propertyChanges.join(', ')}`,
            previousValue: existing.properties,
            newValue: entity.properties,
          });
        }
      }
    }
  }

  // Detect removed entities (entities in ontology whose source IDs are no longer present)
  const newSourceIds = new Set(newEntities.map((e) => e.id));
  for (const node of currentNodes) {
    const allSourcesMissing = node.sourceEntities.every((sid) => newSourceIds.has(sid) === false);
    // Only flag as removed if we have new data from the same source systems
    const nodeSourceSystems = new Set<string>();
    for (const entity of newEntities) {
      if (node.sourceEntities.includes(entity.sourceId)) {
        nodeSourceSystems.add(entity.sourceSystem);
      }
    }
    // Skip removal detection if we don't have overlapping source data
    // (we only detect removal when we have new data from the same source)
  }

  // Detect potential relationship changes
  // If a node's properties changed significantly, its relationships may need updating
  const modifiedEntityIds = new Set(
    changes
      .filter((c) => c.type === 'entity_modified' && c.significance !== 'low')
      .map((c) => c.entityId!)
  );

  for (const rel of currentRelationships) {
    if (modifiedEntityIds.has(rel.sourceNodeId) || modifiedEntityIds.has(rel.targetNodeId)) {
      changes.push({
        type: 'relationship_modified',
        significance: 'medium',
        relationshipId: rel.id,
        description: `Relationship "${rel.type}" between nodes may need review due to entity property changes`,
      });
    }
  }

  // Calculate overall significance
  const overallSignificance = calculateOverallSignificance(changes);

  const report: DriftReport = {
    orgId,
    changes,
    overallSignificance,
    timestamp: new Date().toISOString(),
  };

  // Persist drift report
  await storage.putJSON(orgId, 'ontology', `drift-${Date.now()}.json`, report);

  // Emit events for significant drift
  if (changes.length > 0 && overallSignificance !== 'low') {
    for (const change of changes.filter((c) => c.significance === 'high')) {
      await publishDriftDetected({
        orgId,
        driftType: mapDriftType(change.type),
        significance: change.significance,
        description: change.description,
        affectedEntities: [change.entityId ?? change.relationshipId ?? 'unknown'],
        timestamp: new Date().toISOString(),
      });
    }

    // Also emit a single summary event for medium changes
    const mediumChanges = changes.filter((c) => c.significance === 'medium');
    if (mediumChanges.length > 0) {
      await publishDriftDetected({
        orgId,
        driftType: 'entity_added',
        significance: 'medium',
        description: `${mediumChanges.length} medium-significance changes detected in ontology`,
        affectedEntities: mediumChanges
          .map((c) => c.entityId ?? c.relationshipId ?? '')
          .filter(Boolean),
        timestamp: new Date().toISOString(),
      });
    }
  }

  return report;
}

// ── Helpers ───────────────────────────────────────────────────────

function normaliseKey(name: string, entityType: string): string {
  return `${entityType}::${name.toLowerCase().trim()}`;
}

function classifyEntitySignificance(entity: NormalisedEntity): 'low' | 'medium' | 'high' {
  // High significance: people, departments, core business entities
  const highTypes = new Set(['employee', 'department', 'company', 'customer', 'supplier']);
  if (highTypes.has(entity.entityType)) return 'high';

  // Medium significance: projects, tools, processes
  const mediumTypes = new Set(['project', 'tool', 'process', 'product', 'service']);
  if (mediumTypes.has(entity.entityType)) return 'medium';

  // Low significance: documents, communications, transactions
  return 'low';
}

function detectPropertyChanges(
  oldProps: Record<string, unknown>,
  newProps: Record<string, unknown>,
): string[] {
  const changes: string[] = [];

  for (const [key, newValue] of Object.entries(newProps)) {
    const oldValue = oldProps[key];
    if (oldValue === undefined) {
      changes.push(`added: ${key}`);
    } else if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes.push(`changed: ${key}`);
    }
  }

  for (const key of Object.keys(oldProps)) {
    if (!(key in newProps)) {
      changes.push(`removed: ${key}`);
    }
  }

  return changes;
}

function calculateOverallSignificance(changes: DriftChange[]): 'low' | 'medium' | 'high' {
  if (changes.length === 0) return 'low';

  const highCount = changes.filter((c) => c.significance === 'high').length;
  const mediumCount = changes.filter((c) => c.significance === 'medium').length;

  if (highCount >= 3) return 'high';
  if (highCount >= 1) return 'medium';
  if (mediumCount >= 5) return 'high';
  if (mediumCount >= 2) return 'medium';

  return 'low';
}

function mapDriftType(
  changeType: DriftChange['type'],
): 'entity_added' | 'entity_removed' | 'relationship_changed' | 'process_diverged' {
  switch (changeType) {
    case 'entity_added':
      return 'entity_added';
    case 'entity_removed':
      return 'entity_removed';
    case 'entity_modified':
      return 'entity_added'; // Closest match in the contract
    case 'relationship_added':
    case 'relationship_removed':
    case 'relationship_modified':
      return 'relationship_changed';
    default:
      return 'entity_added';
  }
}
