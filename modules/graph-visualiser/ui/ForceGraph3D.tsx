import { type Component, onMount, onCleanup, createEffect, createSignal } from 'solid-js';
import type { ForceGraphData, GraphNode, GraphLink } from '../services/graph-data.service.js';

// 3d-force-graph is imported at runtime (vanilla JS library)
// Types declared inline for the wrapper
interface ForceGraph3DInstance {
  (container: HTMLElement): ForceGraph3DInstance;
  graphData(data: { nodes: unknown[]; links: unknown[] }): ForceGraph3DInstance;
  nodeColor(fn: (node: unknown) => string): ForceGraph3DInstance;
  nodeVal(fn: (node: unknown) => number): ForceGraph3DInstance;
  nodeLabel(fn: (node: unknown) => string): ForceGraph3DInstance;
  nodeThreeObject?(fn: (node: unknown) => unknown): ForceGraph3DInstance;
  nodeOpacity(val: number): ForceGraph3DInstance;
  linkColor(fn: (link: unknown) => string): ForceGraph3DInstance;
  linkWidth(fn: (link: unknown) => number): ForceGraph3DInstance;
  linkDirectionalArrowLength(val: number): ForceGraph3DInstance;
  linkDirectionalArrowRelPos(val: number): ForceGraph3DInstance;
  linkLabel(fn: (link: unknown) => string): ForceGraph3DInstance;
  linkOpacity(val: number): ForceGraph3DInstance;
  onNodeClick(fn: (node: unknown, event: MouseEvent) => void): ForceGraph3DInstance;
  onNodeHover(fn: (node: unknown | null, prev: unknown | null) => void): ForceGraph3DInstance;
  onZoom?(fn: (transform: { k: number }) => void): ForceGraph3DInstance;
  d3Force(name: string, force?: unknown): ForceGraph3DInstance;
  cameraPosition(pos: { x: number; y: number; z: number }, lookAt?: { x: number; y: number; z: number }, ms?: number): ForceGraph3DInstance;
  backgroundColor(color: string): ForceGraph3DInstance;
  width(w: number): ForceGraph3DInstance;
  height(h: number): ForceGraph3DInstance;
  enableNodeDrag(enable: boolean): ForceGraph3DInstance;
  enableNavigationControls(enable: boolean): ForceGraph3DInstance;
  showNavInfo(show: boolean): ForceGraph3DInstance;
  cooldownTicks(ticks: number): ForceGraph3DInstance;
  warmupTicks(ticks: number): ForceGraph3DInstance;
  scene(): unknown;
  camera(): unknown;
  controls(): { addEventListener: (event: string, fn: () => void) => void; removeEventListener: (event: string, fn: () => void) => void };
  renderer(): unknown;
  _destructor?(): void;
  pauseAnimation?(): void;
  resumeAnimation?(): void;
}

export interface ForceGraph3DProps {
  data: ForceGraphData;
  width: number;
  height: number;
  onNodeClick?: (node: GraphNode) => void;
  onNodeHover?: (node: GraphNode | null) => void;
  highlightNodeIds?: Set<string>;
  focusNodeId?: string | null;
}

// ── Semantic zoom thresholds ──────────────────────────────────────

const ZOOM_CLUSTER_ONLY = 150;   // camera distance > 150: show only cluster centroids
const ZOOM_SHOW_LABELS = 80;     // camera distance < 80: show node labels

export const ForceGraph3D: Component<ForceGraph3DProps> = (props) => {
  let container!: HTMLDivElement;
  let graphInstance: ForceGraph3DInstance | null = null;
  let zoomChangeHandler: (() => void) | null = null;
  const [currentZoomDistance, setCurrentZoomDistance] = createSignal(200);

  onMount(async () => {
    // Dynamically import 3d-force-graph (vanilla JS, no SSR)
    const ForceGraph3DLib = (await import('3d-force-graph')).default;

    const graph = ForceGraph3DLib()(container) as unknown as ForceGraph3DInstance;
    graphInstance = graph;

    graph
      .backgroundColor('#0f172a')
      .width(props.width)
      .height(props.height)
      .nodeColor((node: unknown) => {
        const n = node as GraphNode;
        if (props.highlightNodeIds && props.highlightNodeIds.size > 0) {
          return props.highlightNodeIds.has(n.id) ? n.color : '#334155';
        }
        return n.color;
      })
      .nodeVal((node: unknown) => {
        const n = node as GraphNode;
        return n.size;
      })
      .nodeLabel((node: unknown) => {
        const n = node as GraphNode;
        const distance = currentZoomDistance();
        if (distance > ZOOM_CLUSTER_ONLY) {
          return n.isClusterCentroid ? n.clusterName ?? n.department ?? '' : '';
        }
        if (distance < ZOOM_SHOW_LABELS) {
          return `<div style="background:rgba(15,23,42,0.9);color:white;padding:4px 8px;border-radius:4px;font-size:12px;">
            <strong>${n.name}</strong><br/>
            <span style="color:#94a3b8">${n.entityType}</span>
            ${n.department ? `<br/><span style="color:#64748b">${n.department}</span>` : ''}
          </div>`;
        }
        return n.name;
      })
      .nodeOpacity(0.9)
      .linkColor((link: unknown) => {
        const l = link as GraphLink;
        return l.color;
      })
      .linkWidth((link: unknown) => {
        const l = link as GraphLink;
        return Math.max(0.5, l.confidence * 2);
      })
      .linkDirectionalArrowLength(4)
      .linkDirectionalArrowRelPos(1)
      .linkLabel((link: unknown) => {
        const l = link as GraphLink;
        return `<div style="background:rgba(15,23,42,0.9);color:white;padding:2px 6px;border-radius:3px;font-size:11px;">
          ${l.type} (${Math.round(l.confidence * 100)}%)
        </div>`;
      })
      .linkOpacity(0.6)
      .onNodeClick((node: unknown, _event: MouseEvent) => {
        const n = node as GraphNode;
        props.onNodeClick?.(n);

        // Smooth camera transition to clicked node
        if (n.x !== undefined && n.y !== undefined && n.z !== undefined) {
          const distance = 60;
          graph.cameraPosition(
            { x: n.x + distance, y: n.y + distance, z: n.z + distance },
            { x: n.x, y: n.y, z: n.z },
            1000,
          );
        }
      })
      .onNodeHover((node: unknown | null) => {
        const n = node as GraphNode | null;
        container.style.cursor = n ? 'pointer' : 'default';
        props.onNodeHover?.(n);
      })
      .enableNodeDrag(true)
      .enableNavigationControls(true)
      .showNavInfo(false)
      .cooldownTicks(100)
      .warmupTicks(50);

    // Track zoom distance for semantic zoom
    const controls = graph.controls();
    if (controls) {
      zoomChangeHandler = () => {
        const camera = graph.camera() as { position: { x: number; y: number; z: number } } | undefined;
        if (camera?.position) {
          const { x, y, z } = camera.position;
          const dist = Math.sqrt(x * x + y * y + z * z);
          setCurrentZoomDistance(dist);
        }
      };
      controls.addEventListener('change', zoomChangeHandler);
    }

    // Set initial graph data
    const graphData = buildSemanticZoomData(props.data, currentZoomDistance());
    graph.graphData(graphData);
  });

  // React to data changes
  createEffect(() => {
    if (!graphInstance) return;
    const graphData = buildSemanticZoomData(props.data, currentZoomDistance());
    graphInstance.graphData(graphData);
  });

  // React to zoom level changes for semantic zoom
  createEffect(() => {
    if (!graphInstance) return;
    const distance = currentZoomDistance();
    const graphData = buildSemanticZoomData(props.data, distance);
    graphInstance.graphData(graphData);
  });

  // React to size changes
  createEffect(() => {
    if (!graphInstance) return;
    graphInstance.width(props.width).height(props.height);
  });

  // Focus camera on a specific node
  createEffect(() => {
    const nodeId = props.focusNodeId;
    if (!graphInstance || !nodeId) return;

    const node = props.data.nodes.find((n) => n.id === nodeId);
    if (node && node.x !== undefined && node.y !== undefined && node.z !== undefined) {
      graphInstance.cameraPosition(
        { x: node.x + 60, y: node.y + 60, z: node.z + 60 },
        { x: node.x, y: node.y, z: node.z },
        1500,
      );
    }
  });

  onCleanup(() => {
    if (graphInstance) {
      // Remove zoom handler
      if (zoomChangeHandler) {
        try {
          const controls = graphInstance.controls();
          controls?.removeEventListener('change', zoomChangeHandler);
        } catch {
          // Controls may already be disposed
        }
      }
      // Destroy the 3D scene
      if (graphInstance._destructor) {
        graphInstance._destructor();
      } else if (graphInstance.pauseAnimation) {
        graphInstance.pauseAnimation();
      }
      graphInstance = null;
    }
    // Clear container
    if (container) {
      container.innerHTML = '';
    }
  });

  return (
    <div
      ref={container!}
      class="w-full h-full rounded-lg overflow-hidden"
      style={{ background: '#0f172a' }}
    />
  );
};

// ── Semantic zoom data filtering ──────────────────────────────────

function buildSemanticZoomData(
  data: ForceGraphData,
  zoomDistance: number,
): { nodes: GraphNode[]; links: GraphLink[] } {
  // Far zoom: show only cluster centroids
  if (zoomDistance > ZOOM_CLUSTER_ONLY) {
    const clusterCentroids: GraphNode[] = [];
    const centroidIds = new Set<string>();

    for (const cluster of data.clusters) {
      // Pick the most-connected node as centroid, or first node
      const clusterNodes = data.nodes.filter((n) => cluster.nodeIds.includes(n.id));
      if (clusterNodes.length === 0) continue;

      const centroid = clusterNodes.reduce((best, n) =>
        n.connectionCount > best.connectionCount ? n : best,
      );

      clusterCentroids.push({
        ...centroid,
        isClusterCentroid: true,
        clusterName: cluster.name,
        size: Math.max(centroid.size, 15),
        color: cluster.color,
      });
      centroidIds.add(centroid.id);
    }

    // Links between cluster centroids only
    const centroidLinks = data.links.filter(
      (l) => centroidIds.has(l.source) && centroidIds.has(l.target),
    );

    return { nodes: clusterCentroids, links: centroidLinks };
  }

  // Normal zoom: show all nodes
  return { nodes: data.nodes, links: data.links };
}
