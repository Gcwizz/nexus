import { type Component, Show, For } from 'solid-js';
import type { GraphNode, GraphLink } from '../services/graph-data.service.js';

export interface EntityDetailProps {
  node: GraphNode | null;
  connections: Array<{ node: GraphNode; relationship: GraphLink }>;
  onClose: () => void;
  onNavigate: (nodeId: string) => void;
}

export const EntityDetail: Component<EntityDetailProps> = (props) => {
  const confidenceLabel = (c: number): string => {
    if (c >= 0.8) return 'High';
    if (c >= 0.5) return 'Medium';
    return 'Low';
  };

  const confidenceColor = (c: number): string => {
    if (c >= 0.8) return 'text-green-600 bg-green-50';
    if (c >= 0.5) return 'text-amber-600 bg-amber-50';
    return 'text-red-600 bg-red-50';
  };

  return (
    <Show when={props.node}>
      {(node) => (
        <div class="bg-white rounded-xl border shadow-lg overflow-hidden max-h-full flex flex-col">
          {/* Header */}
          <div class="flex items-start justify-between p-4 border-b bg-gray-50">
            <div class="flex-1 min-w-0">
              <h3 class="text-lg font-semibold text-gray-900 truncate">{node().name}</h3>
              <div class="flex items-center gap-2 mt-1">
                <span
                  class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{ background: node().color + '20', color: node().color }}
                >
                  {node().entityType}
                </span>
                <Show when={node().department}>
                  <span class="text-xs text-gray-500">{node().department}</span>
                </Show>
              </div>
            </div>
            <button
              class="ml-2 p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              onClick={props.onClose}
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body - scrollable */}
          <div class="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Description */}
            <Show when={node().description}>
              <div>
                <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Description
                </h4>
                <p class="text-sm text-gray-700">{node().description}</p>
              </div>
            </Show>

            {/* Confidence */}
            <div>
              <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Confidence
              </h4>
              <div class="flex items-center gap-2">
                <div class="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all"
                    style={{
                      width: `${node().confidence * 100}%`,
                      background: node().confidence >= 0.8 ? '#16a34a' : node().confidence >= 0.5 ? '#d97706' : '#dc2626',
                    }}
                  />
                </div>
                <span class={`px-2 py-0.5 rounded-full text-xs font-medium ${confidenceColor(node().confidence)}`}>
                  {confidenceLabel(node().confidence)} ({Math.round(node().confidence * 100)}%)
                </span>
              </div>
            </div>

            {/* Properties */}
            <Show when={Object.keys(node().properties).length > 0}>
              <div>
                <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Properties
                </h4>
                <div class="space-y-1.5">
                  <For each={Object.entries(node().properties)}>
                    {([key, value]) => (
                      <div class="flex items-start text-sm">
                        <span class="text-gray-500 font-medium min-w-[100px] shrink-0">{key}</span>
                        <span class="text-gray-900 break-all">{String(value)}</span>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>

            {/* Source Provenance */}
            <Show when={node().sourceEntities.length > 0}>
              <div>
                <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Source Provenance
                </h4>
                <div class="flex flex-wrap gap-1.5">
                  <For each={node().sourceEntities}>
                    {(source) => (
                      <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                        {source}
                      </span>
                    )}
                  </For>
                </div>
              </div>
            </Show>

            {/* Stats */}
            <div class="grid grid-cols-2 gap-3">
              <div class="bg-gray-50 rounded-lg p-3">
                <div class="text-2xl font-bold text-gray-900">{node().connectionCount}</div>
                <div class="text-xs text-gray-500">Connections</div>
              </div>
              <Show when={node().hierarchyLevel !== undefined}>
                <div class="bg-gray-50 rounded-lg p-3">
                  <div class="text-2xl font-bold text-gray-900">{node().hierarchyLevel}</div>
                  <div class="text-xs text-gray-500">Hierarchy Level</div>
                </div>
              </Show>
            </div>

            {/* Connected Entities */}
            <Show when={props.connections.length > 0}>
              <div>
                <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Connected Entities ({props.connections.length})
                </h4>
                <div class="space-y-2 max-h-64 overflow-y-auto">
                  <For each={props.connections}>
                    {(conn) => (
                      <button
                        class="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 text-left transition-colors border border-transparent hover:border-gray-200"
                        onClick={() => props.onNavigate(conn.node.id)}
                      >
                        <div
                          class="w-3 h-3 rounded-full shrink-0"
                          style={{ background: conn.node.color }}
                        />
                        <div class="flex-1 min-w-0">
                          <div class="text-sm font-medium text-gray-900 truncate">
                            {conn.node.name}
                          </div>
                          <div class="text-xs text-gray-500">
                            <span
                              class="inline-flex items-center px-1.5 py-0.5 rounded text-xs"
                              style={{ background: conn.relationship.color + '20', color: conn.relationship.color }}
                            >
                              {conn.relationship.type}
                            </span>
                            <span class="ml-1.5">{conn.node.entityType}</span>
                          </div>
                        </div>
                        <svg class="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    )}
                  </For>
                </div>
              </div>
            </Show>
          </div>
        </div>
      )}
    </Show>
  );
};
