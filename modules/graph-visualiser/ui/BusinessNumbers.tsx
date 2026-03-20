import { type Component, Show, For, createResource } from 'solid-js';
import { DashboardCard } from '@nexus/ui/DashboardCard';
import { EmptyState } from '@nexus/ui/EmptyState';
import type { OntologySummary } from '@nexus/contracts';

export interface BusinessNumbersProps {
  orgId: string;
}

async function fetchSummary(orgId: string): Promise<OntologySummary> {
  const response = await fetch(`/api/graph/${encodeURIComponent(orgId)}/summary`);
  if (!response.ok) throw new Error('Failed to load summary');
  return response.json() as Promise<OntologySummary>;
}

export const BusinessNumbers: Component<BusinessNumbersProps> = (props) => {
  const [summary] = createResource(() => props.orgId, fetchSummary);

  return (
    <div class="space-y-6">
      {/* Header */}
      <div>
        <h2 class="text-2xl font-bold text-gray-900">Business in Numbers</h2>
        <p class="text-sm text-gray-500 mt-1">
          Executive summary of your organisation's digital landscape
        </p>
      </div>

      <Show
        when={!summary.loading && summary()}
        fallback={
          <Show
            when={summary.loading}
            fallback={
              <EmptyState
                title="No data available"
                description="Connect your tools and run the ontology engine to see your business in numbers."
              />
            }
          >
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              <For each={Array(7).fill(0)}>
                {() => (
                  <div class="bg-white rounded-xl border p-6 animate-pulse">
                    <div class="h-3 bg-gray-200 rounded w-20 mb-3" />
                    <div class="h-8 bg-gray-200 rounded w-16 mb-2" />
                    <div class="h-3 bg-gray-200 rounded w-24" />
                  </div>
                )}
              </For>
            </div>
          </Show>
        }
      >
        {(data) => (
          <>
            {/* Primary metrics row */}
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              <DashboardCard
                label="Total Entities"
                value={data().totalEntities.toLocaleString()}
                subtitle={`${data().totalRelationships.toLocaleString()} relationships`}
              />

              <DashboardCard
                label="Employees"
                value={countEntityType(data(), 'employee', 'person').toLocaleString()}
                subtitle="People in the org"
              />

              <DashboardCard
                label="Departments"
                value={Object.keys(data().departmentBreakdown).length.toLocaleString()}
                subtitle="Organisational units"
              />

              <DashboardCard
                label="Tools Connected"
                value={data().toolInventory.length.toLocaleString()}
                subtitle={`${data().toolInventory.reduce((sum, t) => sum + t.entityCount, 0)} total references`}
              />
            </div>

            {/* Secondary metrics */}
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              <DashboardCard
                label="Processes Mapped"
                value={countEntityType(data(), 'process', 'workflow').toLocaleString()}
                subtitle="Discovered so far"
              />

              <DashboardCard
                label="Cross-Dept Handoffs"
                value="--"
                subtitle="Available after process mapping"
              />

              <DashboardCard
                label="Ghost Processes"
                value={data().ghostProcesses.toLocaleString()}
                subtitle="Detected from patterns"
              />

              <DashboardCard
                label="Avg Confidence"
                value={`${averageConfidence(data())}%`}
                subtitle={confidenceSummary(data())}
              />
            </div>

            {/* Confidence Distribution */}
            <div class="bg-white rounded-xl border p-6">
              <h3 class="text-sm font-semibold text-gray-900 mb-4">Confidence Distribution</h3>
              <div class="flex items-end gap-1 h-20">
                <ConfidenceBar
                  label="High"
                  count={data().confidenceDistribution.high}
                  total={data().totalEntities}
                  color="bg-green-500"
                />
                <ConfidenceBar
                  label="Medium"
                  count={data().confidenceDistribution.medium}
                  total={data().totalEntities}
                  color="bg-amber-500"
                />
                <ConfidenceBar
                  label="Low"
                  count={data().confidenceDistribution.low}
                  total={data().totalEntities}
                  color="bg-red-500"
                />
              </div>
              <div class="flex gap-1 mt-2">
                <div class="flex-1 text-center text-xs text-gray-500">
                  High ({data().confidenceDistribution.high})
                </div>
                <div class="flex-1 text-center text-xs text-gray-500">
                  Medium ({data().confidenceDistribution.medium})
                </div>
                <div class="flex-1 text-center text-xs text-gray-500">
                  Low ({data().confidenceDistribution.low})
                </div>
              </div>
            </div>

            {/* Department Breakdown */}
            <div class="bg-white rounded-xl border p-6">
              <h3 class="text-sm font-semibold text-gray-900 mb-4">Department Breakdown</h3>
              <div class="space-y-3">
                <For each={sortedDepartments(data())}>
                  {([dept, count]) => (
                    <div class="flex items-center gap-3">
                      <span class="text-sm text-gray-700 w-32 truncate">{dept}</span>
                      <div class="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          class="h-full bg-blue-500 rounded-full"
                          style={{ width: `${(count / data().totalEntities) * 100}%` }}
                        />
                      </div>
                      <span class="text-sm text-gray-500 w-12 text-right">{count}</span>
                    </div>
                  )}
                </For>
              </div>
            </div>

            {/* Tool Inventory */}
            <Show when={data().toolInventory.length > 0}>
              <div class="bg-white rounded-xl border p-6">
                <h3 class="text-sm font-semibold text-gray-900 mb-4">
                  Tool Inventory ({data().toolInventory.length})
                </h3>
                <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  <For each={data().toolInventory}>
                    {(tool) => (
                      <div class="flex items-center gap-2.5 p-3 rounded-lg bg-gray-50">
                        <div class="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700 text-sm font-bold">
                          {tool.name.charAt(0).toUpperCase()}
                        </div>
                        <div class="flex-1 min-w-0">
                          <div class="text-sm font-medium text-gray-900 truncate">{tool.name}</div>
                          <div class="text-xs text-gray-500">{tool.category}</div>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>
          </>
        )}
      </Show>
    </div>
  );
};

// ── Sub-components ────────────────────────────────────────────────

interface ConfidenceBarProps {
  label: string;
  count: number;
  total: number;
  color: string;
}

const ConfidenceBar: Component<ConfidenceBarProps> = (props) => {
  const percentage = () => (props.total > 0 ? (props.count / props.total) * 100 : 0);

  return (
    <div class="flex-1 flex flex-col items-center justify-end h-full">
      <div
        class={`w-full rounded-t-sm ${props.color} transition-all`}
        style={{ height: `${Math.max(percentage(), 4)}%` }}
      />
    </div>
  );
};

// ── Helpers ───────────────────────────────────────────────────────

function countEntityType(summary: OntologySummary, ...types: string[]): number {
  let total = 0;
  for (const type of types) {
    total += summary.entityBreakdown[type] ?? 0;
  }
  return total;
}

function averageConfidence(summary: OntologySummary): number {
  const { high, medium, low } = summary.confidenceDistribution;
  const total = high + medium + low;
  if (total === 0) return 0;
  // Approximate: high=0.9, medium=0.65, low=0.25
  const weighted = high * 0.9 + medium * 0.65 + low * 0.25;
  return Math.round((weighted / total) * 100);
}

function confidenceSummary(summary: OntologySummary): string {
  const { high, medium, low } = summary.confidenceDistribution;
  return `${high} high, ${medium} medium, ${low} low`;
}

function sortedDepartments(summary: OntologySummary): [string, number][] {
  return Object.entries(summary.departmentBreakdown).sort((a, b) => b[1] - a[1]);
}
