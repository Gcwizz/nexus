import { graph } from '@nexus/graph';
import type { OntologySummary } from '@nexus/contracts';

/**
 * Generates OntologySummary data for the Business in Numbers dashboard.
 * Aggregates entity counts by type, department breakdown, tool inventory,
 * confidence distribution.
 */
export async function generateSummary(orgId: string): Promise<OntologySummary> {
  const { nodes, relationships } = await graph.ontology.read(orgId, { depth: 1 });

  // Entity breakdown by type
  const entityBreakdown: Record<string, number> = {};
  for (const node of nodes) {
    const type = node.entityType;
    entityBreakdown[type] = (entityBreakdown[type] ?? 0) + 1;
  }

  // Department breakdown
  const departmentBreakdown: Record<string, number> = {};
  for (const node of nodes) {
    const dept = node.department ?? 'Uncategorised';
    departmentBreakdown[dept] = (departmentBreakdown[dept] ?? 0) + 1;
  }

  // Tool inventory: entities of type tool/software/application
  const toolTypes = new Set(['tool', 'software', 'application']);
  const toolMap = new Map<string, { name: string; category: string; entityCount: number }>();

  for (const node of nodes) {
    if (toolTypes.has(node.entityType.toLowerCase())) {
      const existing = toolMap.get(node.name);
      if (existing) {
        existing.entityCount += 1;
      } else {
        toolMap.set(node.name, {
          name: node.name,
          category: node.entityType,
          entityCount: 1,
        });
      }
    }
  }

  const toolInventory = Array.from(toolMap.values()).sort(
    (a, b) => b.entityCount - a.entityCount,
  );

  // Ghost processes count: count entities with entityType containing 'ghost' or 'process'
  // that have low confidence (detected by process archaeology)
  const ghostProcesses = nodes.filter(
    (n) =>
      n.entityType.toLowerCase().includes('ghost') ||
      (n.entityType.toLowerCase() === 'process' && n.confidence < 0.5),
  ).length;

  // Confidence distribution
  const confidenceDistribution = { high: 0, medium: 0, low: 0 };
  for (const node of nodes) {
    if (node.confidence >= 0.8) {
      confidenceDistribution.high += 1;
    } else if (node.confidence >= 0.5) {
      confidenceDistribution.medium += 1;
    } else {
      confidenceDistribution.low += 1;
    }
  }

  return {
    orgId,
    version: new Date().toISOString(),
    totalEntities: nodes.length,
    totalRelationships: relationships.length,
    entityBreakdown,
    departmentBreakdown,
    toolInventory,
    ghostProcesses,
    confidenceDistribution,
  };
}
