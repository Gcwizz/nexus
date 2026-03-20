import { A } from '@solidjs/router';
import { createSignal, For, Show } from 'solid-js';

const mockMappings = [
  { source: 'sf_contacts.first_name', target: 'customer.name', confidence: 'high' as const, transform: 'concat(first_name, " ", last_name)', status: 'approved' as const },
  { source: 'sf_contacts.email', target: 'customer.email', confidence: 'high' as const, transform: 'lowercase', status: 'approved' as const },
  { source: 'xero_invoices.total', target: 'invoice.amount', confidence: 'high' as const, transform: 'currency_convert(NZD→GBP)', status: 'approved' as const },
  { source: 'xero_invoices.due_date', target: 'invoice.due_at', confidence: 'medium' as const, transform: 'date_format(DD/MM/YYYY→ISO)', status: 'pending' as const },
  { source: 'hs_deals.dealname', target: 'deal.title', confidence: 'high' as const, transform: 'none', status: 'approved' as const },
  { source: 'hs_deals.amount', target: 'deal.value', confidence: 'medium' as const, transform: 'parse_decimal', status: 'pending' as const },
  { source: 'sf_contacts.phone', target: '???', confidence: 'low' as const, transform: 'needs mapping', status: 'unmapped' as const },
];

const mockBatches = [
  { id: 1, entity: 'Customers', total: 2847, loaded: 2847, failed: 3, status: 'complete' as const },
  { id: 2, entity: 'Invoices', total: 1203, loaded: 891, failed: 0, status: 'loading' as const },
  { id: 3, entity: 'Deals', total: 956, loaded: 0, failed: 0, status: 'validating' as const },
  { id: 4, entity: 'Employees', total: 234, loaded: 0, failed: 0, status: 'pending' as const },
  { id: 5, entity: 'Products', total: 178, loaded: 0, failed: 0, status: 'pending' as const },
];

const mockQuality = {
  score: 94,
  duplicates: { found: 47, merged: 41, flagged: 6 },
  coverage: [
    { entity: 'Customer', pct: 98 },
    { entity: 'Invoice', pct: 95 },
    { entity: 'Deal', pct: 87 },
    { entity: 'Employee', pct: 100 },
    { entity: 'Product', pct: 92 },
  ],
};

const confidenceColor = { high: 'bg-emerald-100 text-emerald-700', medium: 'bg-amber-100 text-amber-700', low: 'bg-red-100 text-red-700' };
const batchStatusColor = {
  complete: 'bg-emerald-500', loading: 'bg-blue-500 animate-pulse',
  validating: 'bg-amber-500 animate-pulse', pending: 'bg-gray-300',
  failed: 'bg-red-500',
};
const batchStatusLabel = { complete: 'Complete', loading: 'Loading...', validating: 'Validating', pending: 'Pending', failed: 'Failed' };

export default function Migrate() {
  const [tab, setTab] = createSignal<'mappings' | 'batches' | 'quality'>('batches');
  const totalRecords = mockBatches.reduce((s, b) => s + b.total, 0);
  const totalLoaded = mockBatches.reduce((s, b) => s + b.loaded, 0);

  return (
    <main class="min-h-screen bg-gray-50 p-8">
      <A href="/" class="text-sm text-gray-400 hover:text-gray-600 py-2 inline-flex items-center min-h-[44px]">&larr; Back to Dashboard</A>

      <div class="max-w-5xl mx-auto mt-4">
        <div class="mb-8">
          <span class="text-xs font-mono text-gray-400">Module 9</span>
          <h1 class="text-3xl font-bold tracking-tight text-gray-900">Data Migration Engine</h1>
          <p class="text-gray-500 mt-1">{totalLoaded.toLocaleString()} of {totalRecords.toLocaleString()} records migrated</p>
        </div>

        {/* Progress overview */}
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div class="bg-white border rounded-lg p-4">
            <span class="text-xs text-gray-500">Progress</span>
            <span class="block text-2xl font-bold text-gray-900">{Math.round(totalLoaded / totalRecords * 100)}%</span>
            <div class="w-full bg-gray-100 rounded-full h-1.5 mt-2">
              <div class="h-full bg-blue-500 rounded-full" style={`width: ${Math.round(totalLoaded / totalRecords * 100)}%`} />
            </div>
          </div>
          <div class="bg-white border rounded-lg p-4">
            <span class="text-xs text-gray-500">Data quality</span>
            <span class="block text-2xl font-bold text-emerald-600">{mockQuality.score}%</span>
          </div>
          <div class="bg-white border rounded-lg p-4">
            <span class="text-xs text-gray-500">Duplicates resolved</span>
            <span class="block text-2xl font-bold text-gray-900">{mockQuality.duplicates.merged}</span>
            <span class="text-xs text-amber-600">{mockQuality.duplicates.flagged} flagged for review</span>
          </div>
          <div class="bg-white border rounded-lg p-4">
            <span class="text-xs text-gray-500">Failed records</span>
            <span class="block text-2xl font-bold text-gray-900">3</span>
            <span class="text-xs text-gray-400">of {totalRecords.toLocaleString()}</span>
          </div>
        </div>

        {/* Tabs */}
        <div class="bg-white border rounded-lg overflow-hidden">
          <div class="flex border-b">
            <For each={[['batches', 'Batch monitor'], ['mappings', 'Field mappings'], ['quality', 'Data quality']] as const}>
              {([key, label]) => (
                <button
                  class={`px-4 py-2.5 text-xs font-medium cursor-pointer ${tab() === key ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-400'}`}
                  onClick={() => setTab(key)}
                >{label}</button>
              )}
            </For>
          </div>

          <Show when={tab() === 'batches'}>
            <div class="p-5 space-y-3">
              <For each={mockBatches}>
                {(batch) => (
                  <div class="flex items-center gap-4 py-3 border-b border-gray-100 last:border-0">
                    <div class="w-32">
                      <span class="text-sm font-medium text-gray-900">{batch.entity}</span>
                      <span class="block text-xs text-gray-400">{batch.total.toLocaleString()} records</span>
                    </div>
                    <div class="flex-1">
                      <div class="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div
                          class={`h-full rounded-full transition-all ${batch.status === 'complete' ? 'bg-emerald-500' : batch.status === 'loading' ? 'bg-blue-500' : 'bg-gray-200'}`}
                          style={`width: ${batch.total > 0 ? Math.round(batch.loaded / batch.total * 100) : 0}%`}
                        />
                      </div>
                    </div>
                    <div class="flex items-center gap-2 w-36 justify-end">
                      <Show when={batch.failed > 0}>
                        <span class="text-xs text-red-600">{batch.failed} failed</span>
                      </Show>
                      <span class="flex items-center gap-1.5 text-xs text-gray-500">
                        <span class={`w-2 h-2 rounded-full ${batchStatusColor[batch.status]}`} />
                        {batchStatusLabel[batch.status]}
                      </span>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </Show>

          <Show when={tab() === 'mappings'}>
            <div class="p-5">
              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="text-left text-xs text-gray-500 border-b">
                      <th class="pb-2 font-medium">Source field</th>
                      <th class="pb-2 font-medium">Target field</th>
                      <th class="pb-2 font-medium">Transform</th>
                      <th class="pb-2 font-medium">Confidence</th>
                      <th class="pb-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    <For each={mockMappings}>
                      {(m) => (
                        <tr class="border-b border-gray-100 last:border-0">
                          <td class="py-2 font-mono text-xs text-gray-700">{m.source}</td>
                          <td class="py-2 font-mono text-xs text-gray-700">{m.target}</td>
                          <td class="py-2 text-xs text-gray-500">{m.transform}</td>
                          <td class="py-2"><span class={`text-xs px-2 py-0.5 rounded-full ${confidenceColor[m.confidence]}`}>{m.confidence}</span></td>
                          <td class="py-2">
                            <Show when={m.status === 'pending'}>
                              <button class="text-xs text-blue-600 cursor-pointer hover:text-blue-800">Approve</button>
                            </Show>
                            <Show when={m.status === 'unmapped'}>
                              <button class="text-xs text-amber-600 cursor-pointer hover:text-amber-800">Map field</button>
                            </Show>
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </div>
          </Show>

          <Show when={tab() === 'quality'}>
            <div class="p-5">
              <div class="flex items-center gap-4 mb-6">
                <div class="w-20 h-20 rounded-full border-4 border-emerald-500 flex items-center justify-center">
                  <span class="text-xl font-bold text-emerald-600">{mockQuality.score}%</span>
                </div>
                <div>
                  <span class="text-sm font-medium text-gray-900">Overall data quality score</span>
                  <p class="text-xs text-gray-500 mt-0.5">{mockQuality.duplicates.found} duplicates found, {mockQuality.duplicates.merged} auto-merged, {mockQuality.duplicates.flagged} flagged</p>
                </div>
              </div>
              <h4 class="text-xs font-semibold text-gray-500 uppercase mb-3">Field coverage by entity</h4>
              <div class="space-y-2">
                <For each={mockQuality.coverage}>
                  {(cov) => (
                    <div class="flex items-center gap-3">
                      <span class="text-sm text-gray-600 w-20">{cov.entity}</span>
                      <div class="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                        <div class={`h-full rounded-full ${cov.pct >= 95 ? 'bg-emerald-500' : cov.pct >= 90 ? 'bg-amber-500' : 'bg-red-500'}`} style={`width: ${cov.pct}%`} />
                      </div>
                      <span class="text-xs text-gray-500 w-10 text-right">{cov.pct}%</span>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </main>
  );
}
