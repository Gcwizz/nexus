import { type Component, createSignal, For, Show, createEffect } from 'solid-js';
import type { ForceGraphData } from '../services/graph-data.service.js';

export interface GraphFilterState {
  entityTypes: Set<string>;
  department: string | null;
  minConfidence: number;
  sourceSystems: Set<string>;
}

export interface GraphFiltersProps {
  data: ForceGraphData;
  filters: GraphFilterState;
  onFiltersChange: (filters: GraphFilterState) => void;
}

export const GraphFilters: Component<GraphFiltersProps> = (props) => {
  const [isExpanded, setIsExpanded] = createSignal(true);

  // Derive available filter options from the data
  const entityTypes = (): string[] => {
    const types = new Set<string>();
    for (const node of props.data.nodes) {
      types.add(node.entityType);
    }
    return Array.from(types).sort();
  };

  const departments = (): string[] => {
    const depts = new Set<string>();
    for (const node of props.data.nodes) {
      if (node.department) depts.add(node.department);
    }
    return Array.from(depts).sort();
  };

  const sourceSystems = (): string[] => {
    const systems = new Set<string>();
    for (const node of props.data.nodes) {
      for (const source of node.sourceEntities) {
        systems.add(source);
      }
    }
    return Array.from(systems).sort();
  };

  const toggleEntityType = (type: string) => {
    const next = new Set(props.filters.entityTypes);
    if (next.has(type)) {
      next.delete(type);
    } else {
      next.add(type);
    }
    props.onFiltersChange({ ...props.filters, entityTypes: next });
  };

  const setDepartment = (dept: string | null) => {
    props.onFiltersChange({ ...props.filters, department: dept });
  };

  const setMinConfidence = (value: number) => {
    props.onFiltersChange({ ...props.filters, minConfidence: value });
  };

  const toggleSourceSystem = (system: string) => {
    const next = new Set(props.filters.sourceSystems);
    if (next.has(system)) {
      next.delete(system);
    } else {
      next.add(system);
    }
    props.onFiltersChange({ ...props.filters, sourceSystems: next });
  };

  const resetFilters = () => {
    props.onFiltersChange({
      entityTypes: new Set<string>(),
      department: null,
      minConfidence: 0,
      sourceSystems: new Set<string>(),
    });
  };

  const hasActiveFilters = (): boolean => {
    return (
      props.filters.entityTypes.size > 0 ||
      props.filters.department !== null ||
      props.filters.minConfidence > 0 ||
      props.filters.sourceSystems.size > 0
    );
  };

  return (
    <div class="bg-white rounded-xl border shadow-sm overflow-hidden">
      {/* Header */}
      <button
        class="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
        onClick={() => setIsExpanded(!isExpanded())}
      >
        <span class="flex items-center gap-2">
          Filters
          <Show when={hasActiveFilters()}>
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              Active
            </span>
          </Show>
        </span>
        <svg
          class={`w-4 h-4 transition-transform ${isExpanded() ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <Show when={isExpanded()}>
        <div class="px-4 pb-4 space-y-4 border-t">
          {/* Entity Types */}
          <div class="pt-3">
            <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Entity Types
            </h4>
            <div class="flex flex-wrap gap-1.5">
              <For each={entityTypes()}>
                {(type) => (
                  <button
                    class={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      props.filters.entityTypes.size === 0 || props.filters.entityTypes.has(type)
                        ? 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                    onClick={() => toggleEntityType(type)}
                  >
                    {type}
                  </button>
                )}
              </For>
            </div>
          </div>

          {/* Department */}
          <div>
            <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Department
            </h4>
            <select
              class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={props.filters.department ?? ''}
              onChange={(e) => setDepartment(e.currentTarget.value || null)}
            >
              <option value="">All Departments</option>
              <For each={departments()}>
                {(dept) => <option value={dept}>{dept}</option>}
              </For>
            </select>
          </div>

          {/* Confidence Threshold */}
          <div>
            <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Min Confidence: {Math.round(props.filters.minConfidence * 100)}%
            </h4>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={props.filters.minConfidence}
              onInput={(e) => setMinConfidence(parseFloat(e.currentTarget.value))}
              class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <div class="flex justify-between text-xs text-gray-400 mt-1">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Source Systems */}
          <Show when={sourceSystems().length > 0}>
            <div>
              <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Source Systems
              </h4>
              <div class="space-y-1 max-h-32 overflow-y-auto">
                <For each={sourceSystems()}>
                  {(system) => (
                    <label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:text-gray-900">
                      <input
                        type="checkbox"
                        class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        checked={
                          props.filters.sourceSystems.size === 0 ||
                          props.filters.sourceSystems.has(system)
                        }
                        onChange={() => toggleSourceSystem(system)}
                      />
                      {system}
                    </label>
                  )}
                </For>
              </div>
            </div>
          </Show>

          {/* Reset */}
          <Show when={hasActiveFilters()}>
            <button
              class="w-full py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
              onClick={resetFilters}
            >
              Reset All Filters
            </button>
          </Show>
        </div>
      </Show>
    </div>
  );
};

export function createDefaultFilters(): GraphFilterState {
  return {
    entityTypes: new Set<string>(),
    department: null,
    minConfidence: 0,
    sourceSystems: new Set<string>(),
  };
}
