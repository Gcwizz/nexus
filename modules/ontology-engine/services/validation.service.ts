import { eq, and } from 'drizzle-orm';
import { db, ontologyVersions } from '@nexus/db';
import { graph } from '@nexus/graph';
import { storage } from '@nexus/storage';
import type { OntologyNode, OntologyRelationship, GhostProcess } from '@nexus/contracts/ontology';
import { EntityConflictError, InsufficientDataError } from '@nexus/contracts/errors';
import type { ValidationUpdate, ValidationState } from '../types.js';
import { publishOntologyValidated } from '../events/producers.js';

// ── In-memory validation tracking (per org/version) ───────────────
// In production this would be Redis-backed; using Maps for the service layer.

interface ValidationEntry {
  status: 'pending' | 'approved' | 'rejected';
  modifications?: Record<string, unknown>;
  comment?: string;
  validatedAt?: Date;
}

const entityValidations = new Map<string, Map<string, ValidationEntry>>();
const relationshipValidations = new Map<string, Map<string, ValidationEntry>>();
const ghostProcessValidations = new Map<string, Map<string, ValidationEntry>>();

function getValidationMap(
  store: Map<string, Map<string, ValidationEntry>>,
  key: string,
): Map<string, ValidationEntry> {
  if (!store.has(key)) {
    store.set(key, new Map());
  }
  return store.get(key)!;
}

function versionKey(orgId: string, versionId: string): string {
  return `${orgId}::${versionId}`;
}

// ── Get entities by confidence level ──────────────────────────────

export async function getEntitiesByConfidence(
  orgId: string,
  level: 'high' | 'medium' | 'low' | 'all',
): Promise<OntologyNode[]> {
  const { nodes } = await graph.ontology.read(orgId);

  switch (level) {
    case 'high':
      return nodes.filter((n) => n.confidence >= 0.8);
    case 'medium':
      return nodes.filter((n) => n.confidence >= 0.5 && n.confidence < 0.8);
    case 'low':
      return nodes.filter((n) => n.confidence < 0.5);
    case 'all':
    default:
      return nodes;
  }
}

export async function getRelationshipsByConfidence(
  orgId: string,
  level: 'high' | 'medium' | 'low' | 'all',
): Promise<OntologyRelationship[]> {
  const { relationships } = await graph.ontology.read(orgId);

  switch (level) {
    case 'high':
      return relationships.filter((r) => r.confidence >= 0.8);
    case 'medium':
      return relationships.filter((r) => r.confidence >= 0.5 && r.confidence < 0.8);
    case 'low':
      return relationships.filter((r) => r.confidence < 0.5);
    case 'all':
    default:
      return relationships;
  }
}

export async function getGhostProcessesByConfidence(
  orgId: string,
  level: 'high' | 'medium' | 'low' | 'all',
): Promise<GhostProcess[]> {
  const ghostProcesses = await storage.getJSON<GhostProcess[]>(orgId, 'ontology', 'ghost-processes.json');
  if (!ghostProcesses) return [];

  switch (level) {
    case 'high':
      return ghostProcesses.filter((gp) => gp.confidence >= 0.8);
    case 'medium':
      return ghostProcesses.filter((gp) => gp.confidence >= 0.5 && gp.confidence < 0.8);
    case 'low':
      return ghostProcesses.filter((gp) => gp.confidence < 0.5);
    case 'all':
    default:
      return ghostProcesses;
  }
}

// ── Apply validation updates ──────────────────────────────────────

export async function applyValidationUpdates(
  orgId: string,
  versionId: string,
  updates: ValidationUpdate[],
  userId: string,
): Promise<ValidationState> {
  const key = versionKey(orgId, versionId);
  const entityMap = getValidationMap(entityValidations, key);
  const relMap = getValidationMap(relationshipValidations, key);
  const gpMap = getValidationMap(ghostProcessValidations, key);

  for (const update of updates) {
    const entry: ValidationEntry = {
      status: update.action === 'modify' ? 'approved' : update.action === 'approve' ? 'approved' : 'rejected',
      modifications: update.modifications,
      comment: update.comment,
      validatedAt: new Date(),
    };

    if (update.entityId) {
      entityMap.set(update.entityId, entry);
    } else if (update.relationshipId) {
      relMap.set(update.relationshipId, entry);
    } else if (update.ghostProcessId) {
      gpMap.set(update.ghostProcessId, entry);

      // Update ghost process status in storage
      await updateGhostProcessStatus(
        orgId,
        update.ghostProcessId,
        update.action === 'approve' ? 'confirmed' : update.action === 'reject' ? 'dismissed' : 'detected',
      );
    }
  }

  // Apply entity modifications to the graph
  const modifiedEntities = updates.filter((u) => u.entityId && u.action === 'modify' && u.modifications);
  if (modifiedEntities.length > 0) {
    await applyEntityModifications(orgId, modifiedEntities);
  }

  // Get current validation state
  const state = await getValidationState(orgId, versionId);

  // Update ontologyVersions table with current counts
  await db()
    .update(ontologyVersions)
    .set({
      confidenceHigh: state.confidenceDistribution.high,
      confidenceMedium: state.confidenceDistribution.medium,
      confidenceLow: state.confidenceDistribution.low,
    })
    .where(eq(ontologyVersions.id, versionId));

  // Check if fully validated
  const totalItems = state.totalEntities + state.totalRelationships + state.totalGhostProcesses;
  const totalValidated = state.validatedEntities + state.validatedRelationships + state.validatedGhostProcesses;

  if (totalItems > 0 && totalValidated >= totalItems) {
    await markFullyValidated(orgId, versionId, userId);
  }

  return state;
}

// ── Get validation state ──────────────────────────────────────────

export async function getValidationState(
  orgId: string,
  versionId: string,
): Promise<ValidationState> {
  const key = versionKey(orgId, versionId);
  const entityMap = getValidationMap(entityValidations, key);
  const relMap = getValidationMap(relationshipValidations, key);
  const gpMap = getValidationMap(ghostProcessValidations, key);

  const { nodes, relationships } = await graph.ontology.read(orgId);
  const ghostProcesses = await storage.getJSON<GhostProcess[]>(orgId, 'ontology', 'ghost-processes.json') ?? [];

  const approvedEntities = [...entityMap.values()].filter((v) => v.status === 'approved').length;
  const rejectedEntities = [...entityMap.values()].filter((v) => v.status === 'rejected').length;

  // Compute confidence distribution from graph nodes
  let high = 0;
  let medium = 0;
  let low = 0;

  for (const node of nodes) {
    if (node.confidence >= 0.8) high++;
    else if (node.confidence >= 0.5) medium++;
    else low++;
  }

  return {
    orgId,
    versionId,
    totalEntities: nodes.length,
    validatedEntities: entityMap.size,
    approvedEntities,
    rejectedEntities,
    totalRelationships: relationships.length,
    validatedRelationships: relMap.size,
    totalGhostProcesses: ghostProcesses.length,
    validatedGhostProcesses: gpMap.size,
    confidenceDistribution: { high, medium, low },
  };
}

// ── Internal helpers ──────────────────────────────────────────────

async function updateGhostProcessStatus(
  orgId: string,
  ghostProcessId: string,
  newStatus: 'detected' | 'confirmed' | 'dismissed',
): Promise<void> {
  const ghostProcesses = await storage.getJSON<GhostProcess[]>(orgId, 'ontology', 'ghost-processes.json');
  if (!ghostProcesses) return;

  const updated = ghostProcesses.map((gp) =>
    gp.id === ghostProcessId ? { ...gp, status: newStatus } : gp,
  );

  await storage.putJSON(orgId, 'ontology', 'ghost-processes.json', updated);
}

async function applyEntityModifications(
  orgId: string,
  updates: ValidationUpdate[],
): Promise<void> {
  const { nodes, relationships } = await graph.ontology.read(orgId);

  const modifiedNodes: OntologyNode[] = [];
  for (const update of updates) {
    if (!update.entityId || !update.modifications) continue;

    const existing = nodes.find((n) => n.id === update.entityId);
    if (!existing) {
      throw new EntityConflictError(
        `Entity ${update.entityId} not found in ontology graph`,
        { orgId },
      );
    }

    modifiedNodes.push({
      ...existing,
      ...update.modifications,
      id: existing.id, // Never allow ID changes
      orgId: existing.orgId, // Never allow orgId changes
    } as OntologyNode);
  }

  if (modifiedNodes.length > 0) {
    await graph.ontology.write(orgId, modifiedNodes, []);
  }
}

async function markFullyValidated(
  orgId: string,
  versionId: string,
  userId: string,
): Promise<void> {
  await db()
    .update(ontologyVersions)
    .set({
      status: 'approved',
      validatedBy: userId,
      validatedAt: new Date(),
    })
    .where(eq(ontologyVersions.id, versionId));

  // Get version for event payload
  const [version] = await db()
    .select()
    .from(ontologyVersions)
    .where(eq(ontologyVersions.id, versionId))
    .limit(1);

  if (version) {
    const state = await getValidationState(orgId, versionId);
    await publishOntologyValidated({
      orgId,
      ontologyVersion: version.version,
      validatedBy: userId,
      confidenceSummary: state.confidenceDistribution,
      timestamp: new Date().toISOString(),
    });
  }
}

// ── Initialise validation tracking for a new version ──────────────

export function initValidationTracking(orgId: string, versionId: string): void {
  const key = versionKey(orgId, versionId);
  entityValidations.set(key, new Map());
  relationshipValidations.set(key, new Map());
  ghostProcessValidations.set(key, new Map());
}

// ── Clear validation tracking ─────────────────────────────────────

export function clearValidationTracking(orgId: string, versionId: string): void {
  const key = versionKey(orgId, versionId);
  entityValidations.delete(key);
  relationshipValidations.delete(key);
  ghostProcessValidations.delete(key);
}
