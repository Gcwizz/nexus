import { A } from '@solidjs/router';
import { createSignal, For, Show } from 'solid-js';

const pipelineStages = [
  { name: 'Extraction', status: 'complete' as const, detail: '2,847 raw entities' },
  { name: 'Deduplication', status: 'complete' as const, detail: '1,923 unique entities' },
  { name: 'Relationships', status: 'complete' as const, detail: '4,102 relationships' },
  { name: 'Hierarchy', status: 'complete' as const, detail: '6 departments' },
  { name: 'Archaeology', status: 'complete' as const, detail: '3 ghost processes' },
  { name: 'Validation', status: 'active' as const, detail: '78% validated' },
];

const mockEntities = [
  { name: 'Customer', type: 'Entity', confidence: 'high' as const, source: 'Salesforce + HubSpot', status: 'approved' as const },
  { name: 'Invoice', type: 'Entity', confidence: 'high' as const, source: 'Xero', status: 'approved' as const },
  { name: 'Sales Pipeline', type: 'Process', confidence: 'medium' as const, source: 'Salesforce', status: 'pending' as const },
  { name: 'Monthly Reconciliation', type: 'Ghost Process', confidence: 'low' as const, source: 'Calendar + Email patterns', status: 'pending' as const },
  { name: 'Employee', type: 'Entity', confidence: 'high' as const, source: 'HubSpot + Xero', status: 'approved' as const },
  { name: 'Quarterly Review', type: 'Ghost Process', confidence: 'medium' as const, source: 'Calendar recurring events', status: 'pending' as const },
  { name: 'Product', type: 'Entity', confidence: 'high' as const, source: 'Salesforce', status: 'approved' as const },
  { name: 'Vendor Onboarding', type: 'Ghost Process', confidence: 'low' as const, source: 'Email threads + file timestamps', status: 'rejected' as const },
];

const confidenceColor = {
  high: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-red-100 text-red-700',
};

const statusBadge = {
  approved: 'text-emerald-600',
  pending: 'text-amber-600',
  rejected: 'text-red-600',
};

export default function Ontology() {
  const [filter, setFilter] = createSignal<'all' | 'pending' | 'ghost'>('all');

  const filtered = () => {
    if (filter() === 'pending') return mockEntities.filter(e => e.status === 'pending');
    if (filter() === 'ghost') return mockEntities.filter(e => e.type === 'Ghost Process');
    return mockEntities;
  };

  return (
    <main class="min-h-screen bg-gray-50 p-8">
      <A href="/" class="text-sm text-gray-400 hover:text-gray-600 py-2 inline-flex items-center min-h-[44px]">
        &larr; Back to Dashboard
      </A>

      <div class="max-w-5xl mx-auto mt-4">
        <div class="mb-8">
          <span class="text-xs font-mono text-gray-400">Module 2</span>
          <h1 class="text-3xl font-bold tracking-tight text-gray-900">Ontology Engine</h1>
          <p class="text-gray-500 mt-1">1,923 entities &middot; 4,102 relationships &middot; 3 ghost processes detected</p>
        </div>

        {/* Pipeline progress */}
        <div class="bg-white border rounded-lg p-5 mb-6">
          <h2 class="text-sm font-semibold text-gray-900 mb-4">Generation pipeline</h2>
          <div class="flex items-center gap-1">
            <For each={pipelineStages}>
              {(stage, i) => (
                <div class="flex-1 flex flex-col items-center">
                  <div class={`w-full h-2 rounded-full ${
                    stage.status === 'complete' ? 'bg-emerald-500' :
                    stage.status === 'active' ? 'bg-blue-500 animate-pulse' : 'bg-gray-200'
                  }`} />
                  <span class="text-xs text-gray-600 mt-2 font-medium">{stage.name}</span>
                  <span class="text-xs text-gray-400">{stage.detail}</span>
                </div>
              )}
            </For>
          </div>
        </div>

        {/* Stats */}
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div class="bg-white border rounded-lg p-4">
            <span class="text-xs text-gray-500">Entities</span>
            <span class="block text-2xl font-bold text-gray-900">1,923</span>
          </div>
          <div class="bg-white border rounded-lg p-4">
            <span class="text-xs text-gray-500">Relationships</span>
            <span class="block text-2xl font-bold text-gray-900">4,102</span>
          </div>
          <div class="bg-white border rounded-lg p-4">
            <span class="text-xs text-gray-500">Confidence</span>
            <div class="flex items-center gap-1 mt-1">
              <div class="h-4 bg-emerald-500 rounded-sm" style="width: 60%" />
              <div class="h-4 bg-amber-500 rounded-sm" style="width: 28%" />
              <div class="h-4 bg-red-500 rounded-sm" style="width: 12%" />
            </div>
            <span class="text-xs text-gray-400 mt-1">60% high · 28% med · 12% low</span>
          </div>
          <div class="bg-white border rounded-lg p-4">
            <span class="text-xs text-gray-500">Validation</span>
            <span class="block text-2xl font-bold text-gray-900">78%</span>
            <span class="text-xs text-gray-400">422 pending review</span>
          </div>
        </div>

        {/* Entity review table */}
        <div class="bg-white border rounded-lg p-5">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-sm font-semibold text-gray-900">Entity review</h2>
            <div class="flex gap-1">
              <For each={[['all', 'All'], ['pending', 'Pending'], ['ghost', 'Ghost processes']] as const}>
                {([key, label]) => (
                  <button
                    class={`px-3 py-1 text-xs rounded-md cursor-pointer transition-colors ${
                      filter() === key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                    onClick={() => setFilter(key)}
                  >
                    {label}
                  </button>
                )}
              </For>
            </div>
          </div>

          <div class="space-y-2">
            <For each={filtered()}>
              {(entity) => (
                <div class="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                  <div class="flex items-center gap-3">
                    <span class="text-sm font-medium text-gray-900">{entity.name}</span>
                    <span class={`text-xs px-2 py-0.5 rounded-full ${confidenceColor[entity.confidence]}`}>
                      {entity.confidence}
                    </span>
                    <span class="text-xs text-gray-400">{entity.type}</span>
                  </div>
                  <div class="flex items-center gap-4">
                    <span class="text-xs text-gray-400">{entity.source}</span>
                    <span class={`text-xs font-medium ${statusBadge[entity.status]}`}>{entity.status}</span>
                    <Show when={entity.status === 'pending'}>
                      <div class="flex gap-1">
                        <button class="px-2 py-1 text-xs bg-emerald-50 text-emerald-700 rounded cursor-pointer hover:bg-emerald-100">Approve</button>
                        <button class="px-2 py-1 text-xs bg-red-50 text-red-700 rounded cursor-pointer hover:bg-red-100">Reject</button>
                      </div>
                    </Show>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>
    </main>
  );
}
