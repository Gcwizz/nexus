import {
  type Component,
  createSignal,
  createResource,
  createEffect,
  createMemo,
  Show,
  onMount,
  onCleanup,
} from 'solid-js';
import { ForceGraph3D } from './ForceGraph3D.js';
import { GraphFilters, createDefaultFilters, type GraphFilterState } from './GraphFilters.js';
import { EntityDetail } from './EntityDetail.js';
import { SearchBar } from './SearchBar.js';
import { BusinessNumbers } from './BusinessNumbers.js';
import { EmptyState } from '@nexus/ui/EmptyState';
import type { ForceGraphData, GraphNode, GraphLink } from '../services/graph-data.service.js';

export interface GraphPageProps {
  orgId: string;
}

type ViewMode = 'graph' | 'dashboard';

// ── Data fetcher ──────────────────────────────────────────────────

interface FetchParams {
  orgId: string;
  filters: GraphFilterState;
}

async function fetchGraphData(params: FetchParams): Promise<ForceGraphData> {
  const searchParams = new URLSearchParams();

  if (params.filters.department) {
    searchParams.set('department', params.filters.department);
  }
  if (params.filters.minConfidence > 0) {
    searchParams.set('minConfidence', String(params.filters.minConfidence));
  }
  // Entity type filtering is done client-side for responsiveness

  const qs = searchParams.toString();
  const url = `/api/graph/${encodeURIComponent(params.orgId)}${qs ? `?${qs}` : ''}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to load graph data');
  return response.json() as Promise<ForceGraphData>;
}

async function fetchEntityDetail(
  orgId: string,
  entityId: string,
): Promise<{ node: GraphNode; connections: Array<{ node: GraphNode; relationship: GraphLink }> } | null> {
  const response = await fetch(`/api/graph/${encodeURIComponent(orgId)}/entity/${encodeURIComponent(entityId)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Failed to load entity detail');
  return response.json() as Promise<{ node: GraphNode; connections: Array<{ node: GraphNode; relationship: GraphLink }> }>;
}

// ── Component ─────────────────────────────────────────────────────

export const GraphPage: Component<GraphPageProps> = (props) => {
  const [viewMode, setViewMode] = createSignal<ViewMode>('graph');
  const [filters, setFilters] = createSignal<GraphFilterState>(createDefaultFilters());
  const [selectedNodeId, setSelectedNodeId] = createSignal<string | null>(null);
  const [focusNodeId, setFocusNodeId] = createSignal<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = createSignal<string | null>(null);
  const [dimensions, setDimensions] = createSignal({ width: 800, height: 600 });

  // Fetch graph data reactively based on filters
  const [graphData] = createResource(
    () => ({ orgId: props.orgId, filters: filters() }),
    fetchGraphData,
  );

  // Fetch entity detail when a node is selected
  const [entityDetail] = createResource(
    () => selectedNodeId() ? { orgId: props.orgId, entityId: selectedNodeId()! } : null,
    (params) => params ? fetchEntityDetail(params.orgId, params.entityId) : Promise.resolve(null),
  );

  // Client-side entity type filtering for instant response
  const filteredData = createMemo((): ForceGraphData => {
    const data = graphData();
    if (!data) return { nodes: [], links: [], clusters: [] };

    const activeTypes = filters().entityTypes;
    const activeSources = filters().sourceSystems;

    if (activeTypes.size === 0 && activeSources.size === 0) return data;

    let filteredNodes = data.nodes;

    if (activeTypes.size > 0) {
      filteredNodes = filteredNodes.filter((n) => activeTypes.has(n.entityType));
    }

    if (activeSources.size > 0) {
      filteredNodes = filteredNodes.filter((n) =>
        n.sourceEntities.some((s) => activeSources.has(s)),
      );
    }

    const nodeIds = new Set(filteredNodes.map((n) => n.id));
    const filteredLinks = data.links.filter(
      (l) => nodeIds.has(l.source) && nodeIds.has(l.target),
    );

    // Re-derive clusters
    const clusters = data.clusters
      .map((c) => ({
        ...c,
        nodeIds: c.nodeIds.filter((id) => nodeIds.has(id)),
      }))
      .filter((c) => c.nodeIds.length > 0);

    return { nodes: filteredNodes, links: filteredLinks, clusters };
  });

  // Highlight connected nodes on hover
  const highlightNodeIds = createMemo((): Set<string> => {
    const hovered = hoveredNodeId();
    if (!hovered) return new Set();

    const data = filteredData();
    const connected = new Set<string>([hovered]);

    for (const link of data.links) {
      if (link.source === hovered) connected.add(link.target);
      if (link.target === hovered) connected.add(link.source);
    }

    return connected;
  });

  // Track container dimensions
  let graphContainerRef!: HTMLDivElement;

  const updateDimensions = () => {
    if (graphContainerRef) {
      const rect = graphContainerRef.getBoundingClientRect();
      setDimensions({ width: rect.width, height: rect.height });
    }
  };

  onMount(() => {
    updateDimensions();
    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(graphContainerRef);
    onCleanup(() => resizeObserver.disconnect());
  });

  const handleNodeClick = (node: GraphNode) => {
    setSelectedNodeId(node.id);
  };

  const handleNodeHover = (node: GraphNode | null) => {
    setHoveredNodeId(node?.id ?? null);
  };

  const handleSearchSelect = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setFocusNodeId(nodeId);
    // Reset focus after navigation
    setTimeout(() => setFocusNodeId(null), 2000);
  };

  const handleNavigate = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setFocusNodeId(nodeId);
    setTimeout(() => setFocusNodeId(null), 2000);
  };

  return (
    <div class="h-full flex flex-col bg-gray-50">
      {/* Top bar */}
      <div class="flex items-center gap-4 px-6 py-4 bg-white border-b">
        <h1 class="text-lg font-semibold text-gray-900 shrink-0">Knowledge Graph</h1>

        {/* View mode toggle */}
        <div class="flex items-center bg-gray-100 rounded-lg p-1">
          <button
            class={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode() === 'graph'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setViewMode('graph')}
          >
            3D Graph
          </button>
          <button
            class={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode() === 'dashboard'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setViewMode('dashboard')}
          >
            Business in Numbers
          </button>
        </div>

        {/* Search (graph view only) */}
        <Show when={viewMode() === 'graph'}>
          <div class="flex-1 max-w-md">
            <SearchBar orgId={props.orgId} onSelect={handleSearchSelect} />
          </div>
        </Show>

        {/* Graph stats */}
        <Show when={viewMode() === 'graph' && filteredData().nodes.length > 0}>
          <div class="flex items-center gap-3 text-xs text-gray-500 shrink-0">
            <span>{filteredData().nodes.length.toLocaleString()} nodes</span>
            <span class="text-gray-300">|</span>
            <span>{filteredData().links.length.toLocaleString()} edges</span>
            <span class="text-gray-300">|</span>
            <span>{filteredData().clusters.length} clusters</span>
          </div>
        </Show>
      </div>

      {/* Main content */}
      <Show
        when={viewMode() === 'graph'}
        fallback={
          <div class="flex-1 overflow-y-auto p-6">
            <BusinessNumbers orgId={props.orgId} />
          </div>
        }
      >
        <div class="flex-1 flex overflow-hidden">
          {/* Left sidebar: filters */}
          <div class="w-64 shrink-0 overflow-y-auto p-4 border-r bg-white">
            <Show
              when={graphData() && !graphData.loading}
              fallback={
                <div class="space-y-4">
                  <div class="animate-pulse">
                    <div class="h-4 bg-gray-200 rounded w-16 mb-3" />
                    <div class="space-y-2">
                      <div class="h-8 bg-gray-200 rounded" />
                      <div class="h-8 bg-gray-200 rounded" />
                      <div class="h-8 bg-gray-200 rounded" />
                    </div>
                  </div>
                </div>
              }
            >
              <GraphFilters
                data={filteredData()}
                filters={filters()}
                onFiltersChange={setFilters}
              />
            </Show>
          </div>

          {/* Graph canvas */}
          <div ref={graphContainerRef!} class="flex-1 relative">
            <Show
              when={!graphData.loading && filteredData().nodes.length > 0}
              fallback={
                <Show
                  when={graphData.loading}
                  fallback={
                    <div class="flex items-center justify-center h-full">
                      <EmptyState
                        title="No entities found"
                        description="Adjust your filters or connect tools to discover entities."
                      />
                    </div>
                  }
                >
                  <div class="flex items-center justify-center h-full">
                    <div class="text-center">
                      <div class="w-10 h-10 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
                      <p class="text-sm text-gray-500">Loading knowledge graph...</p>
                    </div>
                  </div>
                </Show>
              }
            >
              <ForceGraph3D
                data={filteredData()}
                width={dimensions().width}
                height={dimensions().height}
                onNodeClick={handleNodeClick}
                onNodeHover={handleNodeHover}
                highlightNodeIds={highlightNodeIds()}
                focusNodeId={focusNodeId()}
              />
            </Show>

            {/* Zoom hints overlay */}
            <div class="absolute bottom-4 left-4 flex items-center gap-2 text-xs text-gray-400 bg-gray-900/70 backdrop-blur-sm px-3 py-2 rounded-lg">
              <span>Scroll to zoom</span>
              <span class="text-gray-600">|</span>
              <span>Click + drag to rotate</span>
              <span class="text-gray-600">|</span>
              <span>Right-click + drag to pan</span>
            </div>
          </div>

          {/* Right sidebar: entity detail */}
          <Show when={selectedNodeId() !== null}>
            <div class="w-80 shrink-0 overflow-y-auto border-l bg-white">
              <EntityDetail
                node={entityDetail() ? entityDetail()!.node : null}
                connections={entityDetail()?.connections ?? []}
                onClose={() => setSelectedNodeId(null)}
                onNavigate={handleNavigate}
              />
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};
