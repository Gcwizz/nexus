import { A } from '@solidjs/router';
import { createSignal, For, Show } from 'solid-js';

const mockStats = [
  { label: 'Total Entities', value: '1,923', subtitle: '+47 this week' },
  { label: 'Employees', value: '234', subtitle: 'across 6 departments' },
  { label: 'Departments', value: '6', subtitle: 'Sales, Finance, Ops, HR, IT, Marketing' },
  { label: 'Tools Connected', value: '3', subtitle: 'Salesforce, Xero, HubSpot' },
  { label: 'Processes Mapped', value: '28', subtitle: '3 ghost processes' },
  { label: 'Cross-Dept Handoffs', value: '41', subtitle: '12 are bottlenecks' },
  { label: 'Ghost Processes', value: '3', subtitle: 'detected from patterns' },
  { label: 'Avg Confidence', value: '84%', subtitle: '60% high, 28% med' },
];

const departments = [
  { name: 'Sales', count: 487, pct: 25 },
  { name: 'Finance', count: 392, pct: 20 },
  { name: 'Operations', count: 341, pct: 18 },
  { name: 'HR', count: 289, pct: 15 },
  { name: 'IT', count: 231, pct: 12 },
  { name: 'Marketing', count: 183, pct: 10 },
];

const tools = [
  { name: 'Salesforce', category: 'CRM', entities: 1247 },
  { name: 'Xero', category: 'Accounting', entities: 1203 },
  { name: 'HubSpot', category: 'Marketing', entities: 956 },
];

const entityTypes = [
  { name: 'Person', checked: true },
  { name: 'Organisation', checked: true },
  { name: 'Product', checked: true },
  { name: 'Process', checked: true },
  { name: 'Document', checked: false },
  { name: 'Transaction', checked: true },
];

export default function Graph() {
  const [view, setView] = createSignal<'graph' | 'numbers'>('graph');
  const [selectedNode, setSelectedNode] = createSignal<string | null>(null);

  return (
    <main class="min-h-screen bg-gray-50">
      <div class="p-4 border-b bg-white flex items-center justify-between">
        <div class="flex items-center gap-4">
          <A href="/" class="text-sm text-gray-400 hover:text-gray-600 py-2 inline-flex items-center min-h-[44px]">
            &larr;
          </A>
          <div>
            <span class="text-xs font-mono text-gray-400">Module 3</span>
            <h1 class="text-lg font-bold text-gray-900">Knowledge Graph Visualiser</h1>
          </div>
        </div>
        <div class="flex gap-1">
          <button
            class={`px-3 py-1.5 text-xs rounded-md cursor-pointer transition-colors ${view() === 'graph' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}
            onClick={() => setView('graph')}
          >
            3D Graph
          </button>
          <button
            class={`px-3 py-1.5 text-xs rounded-md cursor-pointer transition-colors ${view() === 'numbers' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}
            onClick={() => setView('numbers')}
          >
            Business in Numbers
          </button>
        </div>
      </div>

      <Show when={view() === 'graph'}>
        <div class="flex h-[calc(100vh-73px)]">
          {/* Left sidebar — filters */}
          <div class="w-56 border-r bg-white p-4 overflow-y-auto">
            <h3 class="text-xs font-semibold text-gray-500 uppercase mb-3">Entity types</h3>
            <div class="space-y-2">
              <For each={entityTypes}>
                {(et) => (
                  <label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={et.checked} class="rounded" />
                    {et.name}
                  </label>
                )}
              </For>
            </div>

            <h3 class="text-xs font-semibold text-gray-500 uppercase mt-6 mb-3">Confidence</h3>
            <input type="range" min="0" max="100" value="50" class="w-full" />
            <span class="text-xs text-gray-400">Minimum: 50%</span>

            <div class="mt-6 pt-4 border-t">
              <div class="text-xs text-gray-400 space-y-1">
                <div class="flex justify-between"><span>Nodes</span><span class="font-medium text-gray-600">1,923</span></div>
                <div class="flex justify-between"><span>Edges</span><span class="font-medium text-gray-600">4,102</span></div>
                <div class="flex justify-between"><span>Clusters</span><span class="font-medium text-gray-600">6</span></div>
              </div>
            </div>
          </div>

          {/* Center — 3D graph placeholder */}
          <div class="flex-1 bg-gray-900 relative flex items-center justify-center">
            <div class="absolute top-4 left-4 right-4 flex items-center gap-2">
              <input
                type="text"
                placeholder="Search entities…"
                class="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm text-white placeholder:text-gray-500"
              />
            </div>
            {/* Mock graph visualization */}
            <div class="text-center">
              <div class="relative w-80 h-80">
                {/* Mock nodes */}
                <div class="absolute top-8 left-32 w-4 h-4 bg-blue-400 rounded-full shadow-lg shadow-blue-400/30 cursor-pointer" onClick={() => setSelectedNode('Customer')} />
                <div class="absolute top-20 left-12 w-3 h-3 bg-emerald-400 rounded-full shadow-lg shadow-emerald-400/30" />
                <div class="absolute top-16 right-16 w-5 h-5 bg-purple-400 rounded-full shadow-lg shadow-purple-400/30 cursor-pointer" onClick={() => setSelectedNode('Invoice')} />
                <div class="absolute top-40 left-24 w-3 h-3 bg-amber-400 rounded-full shadow-lg shadow-amber-400/30" />
                <div class="absolute top-48 right-24 w-4 h-4 bg-blue-400 rounded-full shadow-lg shadow-blue-400/30" />
                <div class="absolute bottom-20 left-36 w-3 h-3 bg-emerald-400 rounded-full shadow-lg shadow-emerald-400/30" />
                <div class="absolute bottom-32 right-36 w-4 h-4 bg-rose-400 rounded-full shadow-lg shadow-rose-400/30" />
                <div class="absolute top-32 left-44 w-2 h-2 bg-gray-400 rounded-full" />
                <div class="absolute bottom-40 left-16 w-2 h-2 bg-gray-400 rounded-full" />
                <div class="absolute bottom-12 right-20 w-3 h-3 bg-purple-400 rounded-full shadow-lg shadow-purple-400/30" />
                {/* Mock edges (using borders) */}
                <svg class="absolute inset-0 w-full h-full" viewBox="0 0 320 320">
                  <line x1="144" y1="40" x2="52" y2="88" stroke="#60a5fa" stroke-width="0.5" opacity="0.4" />
                  <line x1="144" y1="40" x2="264" y2="72" stroke="#a78bfa" stroke-width="0.5" opacity="0.4" />
                  <line x1="52" y1="88" x2="104" y2="168" stroke="#34d399" stroke-width="0.5" opacity="0.3" />
                  <line x1="264" y1="72" x2="240" y2="200" stroke="#60a5fa" stroke-width="0.5" opacity="0.3" />
                  <line x1="104" y1="168" x2="152" y2="248" stroke="#fbbf24" stroke-width="0.5" opacity="0.3" />
                  <line x1="240" y1="200" x2="232" y2="256" stroke="#f472b6" stroke-width="0.5" opacity="0.3" />
                </svg>
              </div>
              <p class="text-xs text-gray-500 mt-4">3D force-directed graph · scroll to zoom · drag to rotate</p>
            </div>
          </div>

          {/* Right sidebar — entity detail */}
          <Show when={selectedNode()}>
            <div class="w-64 border-l bg-white p-4 overflow-y-auto">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-sm font-semibold text-gray-900">{selectedNode()}</h3>
                <button class="text-xs text-gray-400 hover:text-gray-600 cursor-pointer" onClick={() => setSelectedNode(null)}>x</button>
              </div>
              <div class="space-y-3 text-sm">
                <div><span class="text-gray-500">Type:</span> <span class="text-gray-900">Entity</span></div>
                <div><span class="text-gray-500">Source:</span> <span class="text-gray-900">Salesforce + HubSpot</span></div>
                <div><span class="text-gray-500">Confidence:</span> <span class="text-emerald-600 font-medium">94%</span></div>
                <div><span class="text-gray-500">Department:</span> <span class="text-gray-900">Sales</span></div>
                <div class="pt-3 border-t">
                  <span class="text-xs text-gray-500 font-medium">Related entities</span>
                  <div class="mt-2 space-y-1">
                    <button class="block text-xs text-blue-600 hover:text-blue-800 cursor-pointer">Invoice (142 links)</button>
                    <button class="block text-xs text-blue-600 hover:text-blue-800 cursor-pointer">Opportunity (87 links)</button>
                    <button class="block text-xs text-blue-600 hover:text-blue-800 cursor-pointer">Contact (234 links)</button>
                  </div>
                </div>
              </div>
            </div>
          </Show>
        </div>
      </Show>

      <Show when={view() === 'numbers'}>
        <div class="max-w-5xl mx-auto p-8">
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            <For each={mockStats}>
              {(stat) => (
                <div class="bg-white border rounded-lg p-4">
                  <span class="text-xs text-gray-500">{stat.label}</span>
                  <span class="block text-2xl font-bold text-gray-900">{stat.value}</span>
                  <span class="text-xs text-gray-400">{stat.subtitle}</span>
                </div>
              )}
            </For>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div class="bg-white border rounded-lg p-5">
              <h3 class="text-sm font-semibold text-gray-900 mb-4">Department breakdown</h3>
              <div class="space-y-3">
                <For each={departments}>
                  {(dept) => (
                    <div class="flex items-center gap-3">
                      <span class="text-sm text-gray-600 w-24">{dept.name}</span>
                      <div class="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                        <div class="h-full bg-blue-500 rounded-full" style={`width: ${dept.pct}%`} />
                      </div>
                      <span class="text-xs text-gray-500 w-12 text-right">{dept.count}</span>
                    </div>
                  )}
                </For>
              </div>
            </div>

            <div class="bg-white border rounded-lg p-5">
              <h3 class="text-sm font-semibold text-gray-900 mb-4">Tool inventory</h3>
              <div class="space-y-3">
                <For each={tools}>
                  {(tool) => (
                    <div class="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <div>
                        <span class="text-sm font-medium text-gray-900">{tool.name}</span>
                        <span class="block text-xs text-gray-400">{tool.category}</span>
                      </div>
                      <span class="text-sm font-medium text-gray-600">{tool.entities.toLocaleString()} entities</span>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </div>
        </div>
      </Show>
    </main>
  );
}
