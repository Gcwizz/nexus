import { A } from '@solidjs/router';
import { createSignal, For, Show } from 'solid-js';

const mockModules = [
  { name: 'Sales Pipeline Manager', department: 'Sales', status: 'approved' as const, requirements: 14, endpoints: 8, screens: 5, rules: 6 },
  { name: 'Invoice Automation', department: 'Finance', status: 'review' as const, requirements: 9, endpoints: 5, screens: 3, rules: 4 },
  { name: 'HR Onboarding Portal', department: 'HR', status: 'review' as const, requirements: 11, endpoints: 6, screens: 7, rules: 3 },
  { name: 'Vendor Management', department: 'Finance', status: 'draft' as const, requirements: 7, endpoints: 4, screens: 4, rules: 2 },
  { name: 'Customer Support Desk', department: 'Operations', status: 'draft' as const, requirements: 8, endpoints: 5, screens: 4, rules: 5 },
];

const mockDataModel = [
  { entity: 'Deal', fields: ['id', 'title', 'value', 'stage', 'owner_id', 'customer_id', 'closed_at'], relationships: ['belongs_to Customer', 'belongs_to Employee'] },
  { entity: 'Customer', fields: ['id', 'name', 'email', 'company', 'industry', 'created_at'], relationships: ['has_many Deals', 'has_many Contacts'] },
  { entity: 'PipelineStage', fields: ['id', 'name', 'order', 'probability', 'auto_actions'], relationships: ['has_many Deals'] },
];

const mockEndpoints = [
  { method: 'GET', path: '/api/deals', description: 'List deals with filters', auth: 'required' },
  { method: 'POST', path: '/api/deals', description: 'Create new deal', auth: 'required' },
  { method: 'PATCH', path: '/api/deals/:id/stage', description: 'Move deal to stage', auth: 'required' },
  { method: 'GET', path: '/api/pipeline/stats', description: 'Pipeline conversion metrics', auth: 'required' },
  { method: 'POST', path: '/api/deals/:id/auto-qualify', description: 'Trigger auto-qualification', auth: 'required' },
];

const mockAcceptance = [
  { scenario: 'Sales rep creates a deal', given: 'authenticated as sales rep', when: 'POST /api/deals with valid data', then: 'deal created in "New" stage, notification sent to manager' },
  { scenario: 'Deal moves through pipeline', given: 'deal exists in "Qualified" stage', when: 'PATCH stage to "Proposal Sent"', then: 'stage updated, auto-email sent to customer' },
  { scenario: 'Auto-qualify high-value leads', given: 'deal value > £10,000 from known customer', when: 'deal created', then: 'automatically moved to "Qualified" stage' },
];

const statusBadge = { approved: 'bg-emerald-100 text-emerald-700', review: 'bg-amber-100 text-amber-700', draft: 'bg-gray-100 text-gray-600' };
const methodColor = { GET: 'text-emerald-600', POST: 'text-blue-600', PATCH: 'text-amber-600', PUT: 'text-amber-600', DELETE: 'text-red-600' };

export default function Spec() {
  const [selected, setSelected] = createSignal(0);
  const [section, setSection] = createSignal<'overview' | 'data' | 'api' | 'acceptance'>('overview');

  return (
    <main class="min-h-screen bg-gray-50 p-8">
      <A href="/" class="text-sm text-gray-400 hover:text-gray-600 py-2 inline-flex items-center min-h-[44px]">&larr; Back to Dashboard</A>

      <div class="max-w-5xl mx-auto mt-4">
        <div class="flex items-start justify-between mb-8">
          <div>
            <span class="text-xs font-mono text-gray-400">Module 7</span>
            <h1 class="text-3xl font-bold tracking-tight text-gray-900">Specification Generator</h1>
            <p class="text-gray-500 mt-1">{mockModules.length} software modules specified &middot; {mockModules.filter(m => m.status === 'approved').length} approved</p>
          </div>
          <button class="px-4 py-2 bg-gray-100 text-gray-600 rounded-md text-sm cursor-pointer hover:bg-gray-200">Export all specs</button>
        </div>

        <div class="flex gap-6">
          {/* Module list */}
          <div class="w-64 shrink-0">
            <div class="space-y-1">
              <For each={mockModules}>
                {(mod, i) => (
                  <button
                    class={`w-full text-left p-3 rounded-lg cursor-pointer transition-colors ${selected() === i() ? 'bg-white border shadow-sm' : 'hover:bg-white/50'}`}
                    onClick={() => { setSelected(i()); setSection('overview'); }}
                  >
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-medium text-gray-900">{mod.name}</span>
                      <span class={`text-[10px] px-1.5 py-0.5 rounded-full ${statusBadge[mod.status]}`}>{mod.status}</span>
                    </div>
                    <span class="text-xs text-gray-400">{mod.department}</span>
                  </button>
                )}
              </For>
            </div>
          </div>

          {/* Spec detail */}
          <div class="flex-1 bg-white border rounded-lg overflow-hidden">
            <div class="flex border-b">
              <For each={[['overview', 'Overview'], ['data', 'Data Model'], ['api', 'API'], ['acceptance', 'Acceptance']] as const}>
                {([key, label]) => (
                  <button
                    class={`px-4 py-2.5 text-xs font-medium cursor-pointer ${section() === key ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
                    onClick={() => setSection(key)}
                  >{label}</button>
                )}
              </For>
            </div>

            <div class="p-5">
              <Show when={section() === 'overview'}>
                <h2 class="text-lg font-semibold text-gray-900 mb-1">{mockModules[selected()].name}</h2>
                <p class="text-sm text-gray-500 mb-4">{mockModules[selected()].department} department</p>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div class="bg-gray-50 rounded-md p-3">
                    <span class="text-xs text-gray-500">Requirements</span>
                    <span class="block text-lg font-bold text-gray-900">{mockModules[selected()].requirements}</span>
                  </div>
                  <div class="bg-gray-50 rounded-md p-3">
                    <span class="text-xs text-gray-500">API endpoints</span>
                    <span class="block text-lg font-bold text-gray-900">{mockModules[selected()].endpoints}</span>
                  </div>
                  <div class="bg-gray-50 rounded-md p-3">
                    <span class="text-xs text-gray-500">Screens</span>
                    <span class="block text-lg font-bold text-gray-900">{mockModules[selected()].screens}</span>
                  </div>
                  <div class="bg-gray-50 rounded-md p-3">
                    <span class="text-xs text-gray-500">Business rules</span>
                    <span class="block text-lg font-bold text-gray-900">{mockModules[selected()].rules}</span>
                  </div>
                </div>
                <Show when={mockModules[selected()].status === 'review'}>
                  <div class="mt-4 flex gap-2">
                    <button class="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-md cursor-pointer hover:bg-emerald-700">Approve spec</button>
                    <button class="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-md cursor-pointer hover:bg-gray-200">Request changes</button>
                  </div>
                </Show>
              </Show>

              <Show when={section() === 'data'}>
                <div class="space-y-4">
                  <For each={mockDataModel}>
                    {(entity) => (
                      <div class="border rounded-md p-4">
                        <h3 class="text-sm font-semibold text-gray-900 mb-2">{entity.entity}</h3>
                        <div class="flex flex-wrap gap-1 mb-2">
                          <For each={entity.fields}>
                            {(field) => <span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono">{field}</span>}
                          </For>
                        </div>
                        <div class="text-xs text-gray-400">
                          <For each={entity.relationships}>
                            {(rel) => <span class="block">{rel}</span>}
                          </For>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>

              <Show when={section() === 'api'}>
                <div class="space-y-2">
                  <For each={mockEndpoints}>
                    {(ep) => (
                      <div class="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                        <span class={`text-xs font-mono font-bold w-12 ${methodColor[ep.method as keyof typeof methodColor]}`}>{ep.method}</span>
                        <span class="text-sm font-mono text-gray-700">{ep.path}</span>
                        <span class="text-xs text-gray-400 flex-1">{ep.description}</span>
                      </div>
                    )}
                  </For>
                </div>
              </Show>

              <Show when={section() === 'acceptance'}>
                <div class="space-y-4">
                  <For each={mockAcceptance}>
                    {(ac) => (
                      <div class="border rounded-md p-4">
                        <h4 class="text-sm font-semibold text-gray-900 mb-2">{ac.scenario}</h4>
                        <div class="space-y-1 text-sm">
                          <div><span class="text-gray-500 font-medium">Given</span> <span class="text-gray-700">{ac.given}</span></div>
                          <div><span class="text-gray-500 font-medium">When</span> <span class="text-gray-700">{ac.when}</span></div>
                          <div><span class="text-gray-500 font-medium">Then</span> <span class="text-gray-700">{ac.then}</span></div>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
