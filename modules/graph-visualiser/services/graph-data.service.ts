import { graph } from '@nexus/graph';
import type { OntologyNode, OntologyRelationship } from '@nexus/contracts';
import type { NodeCluster } from '../types.js';

// ── Types for 3d-force-graph consumption ──────────────────────────

export interface GraphNode {
  id: string;
  name: string;
  entityType: string;
  department?: string;
  confidence: number;
  description?: string;
  properties: Record<string, unknown>;
  sourceEntities: string[];
  hierarchyLevel?: number;
  /** Computed: number of connections */
  connectionCount: number;
  /** Computed: node radius based on connections */
  size: number;
  /** Computed: hex color based on entity type */
  color: string;
  /** Position fields for 3d-force-graph */
  x?: number;
  y?: number;
  z?: number;
  /** Cluster centroid flag */
  isClusterCentroid?: boolean;
  clusterName?: string;
}

export interface GraphLink {
  id: string;
  source: string;
  target: string;
  type: string;
  confidence: number;
  properties: Record<string, unknown>;
  evidence: string[];
  color: string;
}

export interface ForceGraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  clusters: NodeCluster[];
}

// ── Entity type colour palette ────────────────────────────────────

const ENTITY_TYPE_COLORS: Record<string, string> = {
  person: '#3b82f6',       // blue
  employee: '#3b82f6',
  department: '#8b5cf6',   // violet
  team: '#a78bfa',         // lighter violet
  tool: '#f59e0b',         // amber
  software: '#f59e0b',
  application: '#f59e0b',
  process: '#10b981',      // emerald
  workflow: '#10b981',
  document: '#6366f1',     // indigo
  system: '#ef4444',       // red
  role: '#ec4899',         // pink
  project: '#14b8a6',      // teal
  client: '#f97316',       // orange
  vendor: '#84cc16',       // lime
  data: '#06b6d4',         // cyan
};

const RELATIONSHIP_TYPE_COLORS: Record<string, string> = {
  REPORTS_TO: '#94a3b8',
  BELONGS_TO: '#a78bfa',
  USES: '#fbbf24',
  MANAGES: '#f87171',
  COLLABORATES_WITH: '#34d399',
  DEPENDS_ON: '#fb923c',
  PRODUCES: '#60a5fa',
  CONSUMES: '#e879f9',
};

const DEFAULT_NODE_COLOR = '#64748b';
const DEFAULT_LINK_COLOR = '#94a3b8';

// ── Service ───────────────────────────────────────────────────────

function getNodeColor(entityType: string): string {
  const key = entityType.toLowerCase();
  return ENTITY_TYPE_COLORS[key] ?? DEFAULT_NODE_COLOR;
}

function getLinkColor(type: string): string {
  return RELATIONSHIP_TYPE_COLORS[type] ?? DEFAULT_LINK_COLOR;
}

function computeNodeSize(connectionCount: number): number {
  const minSize = 3;
  const maxSize = 20;
  // Logarithmic scaling for large graphs
  return Math.min(maxSize, minSize + Math.log2(connectionCount + 1) * 3);
}

function buildConnectionCounts(
  nodes: OntologyNode[],
  relationships: OntologyRelationship[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const node of nodes) {
    counts.set(node.id, 0);
  }
  for (const rel of relationships) {
    counts.set(rel.sourceNodeId, (counts.get(rel.sourceNodeId) ?? 0) + 1);
    counts.set(rel.targetNodeId, (counts.get(rel.targetNodeId) ?? 0) + 1);
  }
  return counts;
}

function buildClusters(nodes: GraphNode[]): NodeCluster[] {
  const clusterMap = new Map<string, string[]>();

  for (const node of nodes) {
    const dept = node.department ?? 'Uncategorised';
    if (!clusterMap.has(dept)) {
      clusterMap.set(dept, []);
    }
    clusterMap.get(dept)!.push(node.id);
  }

  const clusterColors = [
    '#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444',
    '#ec4899', '#14b8a6', '#f97316', '#84cc16', '#06b6d4',
  ];
  let colorIdx = 0;

  const clusters: NodeCluster[] = [];
  for (const [name, nodeIds] of clusterMap) {
    clusters.push({
      id: `cluster-${name.toLowerCase().replace(/\s+/g, '-')}`,
      name,
      nodeIds,
      color: clusterColors[colorIdx % clusterColors.length]!,
      collapsed: false,
    });
    colorIdx++;
  }

  return clusters;
}

export async function fetchGraphData(
  orgId: string,
  options?: {
    entityType?: string;
    department?: string;
    minConfidence?: number;
    depth?: number;
  },
): Promise<ForceGraphData> {
  const { nodes: rawNodes, relationships: rawRels } = await graph.ontology.read(orgId, {
    depth: options?.depth ?? 3,
    entityType: options?.entityType,
  });

  // Apply additional filters
  let filteredNodes = rawNodes;
  if (options?.department) {
    filteredNodes = filteredNodes.filter((n) => n.department === options.department);
  }
  if (options?.minConfidence !== undefined) {
    filteredNodes = filteredNodes.filter((n) => n.confidence >= options.minConfidence!);
  }

  const nodeIdSet = new Set(filteredNodes.map((n) => n.id));

  // Only include relationships where both nodes are present
  const filteredRels = rawRels.filter(
    (r) => nodeIdSet.has(r.sourceNodeId) && nodeIdSet.has(r.targetNodeId),
  );

  if (options?.minConfidence !== undefined) {
    const threshold = options.minConfidence;
    const confidenceFilteredRels = filteredRels.filter((r) => r.confidence >= threshold);
    return transformToForceGraph(filteredNodes, confidenceFilteredRels);
  }

  return transformToForceGraph(filteredNodes, filteredRels);
}

function transformToForceGraph(
  rawNodes: OntologyNode[],
  rawRels: OntologyRelationship[],
): ForceGraphData {
  const connectionCounts = buildConnectionCounts(rawNodes, rawRels);

  const nodes: GraphNode[] = rawNodes.map((n) => {
    const connectionCount = connectionCounts.get(n.id) ?? 0;
    return {
      id: n.id,
      name: n.name,
      entityType: n.entityType,
      department: n.department,
      confidence: n.confidence,
      description: n.description,
      properties: n.properties,
      sourceEntities: n.sourceEntities,
      hierarchyLevel: n.hierarchyLevel,
      connectionCount,
      size: computeNodeSize(connectionCount),
      color: getNodeColor(n.entityType),
    };
  });

  const links: GraphLink[] = rawRels.map((r) => ({
    id: r.id,
    source: r.sourceNodeId,
    target: r.targetNodeId,
    type: r.type,
    confidence: r.confidence,
    properties: r.properties,
    evidence: r.evidence,
    color: getLinkColor(r.type),
  }));

  const clusters = buildClusters(nodes);

  return { nodes, links, clusters };
}

export async function fetchEntityDetail(
  orgId: string,
  entityId: string,
): Promise<{ node: GraphNode; connections: Array<{ node: GraphNode; relationship: GraphLink }> } | null> {
  const { nodes, relationships } = await graph.ontology.read(orgId, { depth: 1 });

  const targetNode = nodes.find((n) => n.id === entityId);
  if (!targetNode) return null;

  const connectionCounts = buildConnectionCounts(nodes, relationships);

  const relatedRels = relationships.filter(
    (r) => r.sourceNodeId === entityId || r.targetNodeId === entityId,
  );

  const toGraphNode = (n: OntologyNode): GraphNode => ({
    id: n.id,
    name: n.name,
    entityType: n.entityType,
    department: n.department,
    confidence: n.confidence,
    description: n.description,
    properties: n.properties,
    sourceEntities: n.sourceEntities,
    hierarchyLevel: n.hierarchyLevel,
    connectionCount: connectionCounts.get(n.id) ?? 0,
    size: computeNodeSize(connectionCounts.get(n.id) ?? 0),
    color: getNodeColor(n.entityType),
  });

  const connections = relatedRels.map((rel) => {
    const connectedId = rel.sourceNodeId === entityId ? rel.targetNodeId : rel.sourceNodeId;
    const connectedNode = nodes.find((n) => n.id === connectedId);
    return {
      node: connectedNode ? toGraphNode(connectedNode) : toGraphNode(targetNode),
      relationship: {
        id: rel.id,
        source: rel.sourceNodeId,
        target: rel.targetNodeId,
        type: rel.type,
        confidence: rel.confidence,
        properties: rel.properties,
        evidence: rel.evidence,
        color: getLinkColor(rel.type),
      },
    };
  });

  return {
    node: toGraphNode(targetNode),
    connections,
  };
}

export async function fetchClusters(orgId: string): Promise<NodeCluster[]> {
  const data = await fetchGraphData(orgId);
  return data.clusters;
}

export { ENTITY_TYPE_COLORS, RELATIONSHIP_TYPE_COLORS };
