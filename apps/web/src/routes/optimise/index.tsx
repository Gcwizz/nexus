import { A } from '@solidjs/router';
import { createSignal, For, Show } from 'solid-js';

const mockRecommendations = [
  { id: 1, title: 'Automate invoice generation from Salesforce deals', type: 'automation' as const, impact: 'high' as const, complexity: 'low' as const, savings: '£14,600/yr', hours: '5 hrs/wk', quickWin: true, status: 'pending' as const, process: 'Lead to Customer', affected: 3 },
  { id: 2, title: 'Eliminate duplicate data entry between CRM and accounting', type: 'lean' as const, impact: 'high' as const, complexity: 'medium' as const, savings: '£9,400/yr', hours: '3 hrs/wk', quickWin: true, status: 'accepted' as const, process: 'Invoice to Payment', affected: 2 },
  { id: 3, title: 'Restructure manager approval to parallel path', type: 'bottleneck' as const, impact: 'high' as const, complexity: 'high' as const, savings: '£18,200/yr', hours: '8 hrs/wk', quickWin: false, status: 'pending' as const, process: 'Lead to Customer', affected: 5 },
  { id: 4, title: 'Replace manual onboarding checklist with automated workflow', type: 'automation' as const, impact: 'medium' as const, complexity: 'medium' as const, savings: '£8,100/yr', hours: '2.5 hrs/wk', quickWin: false, status: 'pending' as const, process: 'Employee Onboarding', affected: 4 },
  { id: 5, title: 'Reduce handoff wait between Sales and Finance', type: 'bottleneck' as const, impact: 'medium' as const, complexity: 'low' as const, savings: '£6,200/yr', hours: '2 hrs/wk', quickWin: true, status: 'implemented' as const, process: 'Lead to Customer', affected: 2 },
  { id: 6, title: 'Consolidate vendor approval chains (3 steps → 1)', type: 'lean' as const, impact: 'medium' as const, complexity: 'low' as const, savings: '£4,800/yr', hours: '1.5 hrs/wk', quickWin: true, status: 'pending' as const, process: 'Vendor Procurement', affected: 3 },
];

const typeColors = { lean: 'bg-purple-100 text-purple-700', bottleneck: 'bg-red-100 text-red-700', automation: 'bg-blue-100 text-blue-700' };
const impactColors = { high: 'text-red-600', medium: 'text-amber-600', low: 'text-gray-500' };
const statusBadge = { pending: 'bg-amber-100 text-amber-700', accepted: 'bg-emerald-100 text-emerald-700', rejected: 'bg-red-100 text-red-700', implemented: 'bg-blue-100 text-blue-700' };

export default function Optimise() {
  const [filter, setFilter] = createSignal<'all' | 'quick-wins' | 'pending'>('all');

  const filtered = () => {
    if (filter() === 'quick-wins') return mockRecommendations.filter(r => r.quickWin);
    if (filter() === 'pending') return mockRecommendations.filter(r => r.status === 'pending');
    return mockRecommendations;
  };

  const totalSavings = mockRecommendations.reduce((sum, r) => sum + parseInt(r.savings.replace(/[^0-9]/g, '')), 0);

  return (
    <main class="min-h-screen bg-gray-50 p-8">
      <A href="/" class="text-sm text-gray-400 hover:text-gray-600 py-2 inline-flex items-center min-h-[44px]">&larr; Back to Dashboard</A>

      <div class="max-w-5xl mx-auto mt-4">
        <div class="mb-8">
          <span class="text-xs font-mono text-gray-400">Module 5</span>
          <h1 class="text-3xl font-bold tracking-tight text-gray-900">AI Optimisation Engine</h1>
          <p class="text-gray-500 mt-1">{mockRecommendations.length} recommendations &middot; {mockRecommendations.filter(r => r.quickWin).length} quick wins</p>
        </div>

        {/* Impact dashboard */}
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div class="bg-white border rounded-lg p-4">
            <span class="text-xs text-gray-500">Total savings potential</span>
            <span class="block text-2xl font-bold text-emerald-600">&pound;{totalSavings.toLocaleString()}/yr</span>
          </div>
          <div class="bg-white border rounded-lg p-4">
            <span class="text-xs text-gray-500">Quick wins</span>
            <span class="block text-2xl font-bold text-gray-900">4</span>
            <span class="text-xs text-gray-400">low complexity, high impact</span>
          </div>
          <div class="bg-white border rounded-lg p-4">
            <span class="text-xs text-gray-500">Time savings</span>
            <span class="block text-2xl font-bold text-gray-900">22 hrs/wk</span>
            <span class="text-xs text-gray-400">across all recommendations</span>
          </div>
          <div class="bg-white border rounded-lg p-4">
            <span class="text-xs text-gray-500">Implemented</span>
            <span class="block text-2xl font-bold text-blue-600">1 of 6</span>
            <span class="text-xs text-gray-400">4 pending review</span>
          </div>
        </div>

        {/* Recommendations list */}
        <div class="bg-white border rounded-lg p-5">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-sm font-semibold text-gray-900">Recommendations</h2>
            <div class="flex gap-1">
              <For each={[['all', 'All'], ['quick-wins', 'Quick wins'], ['pending', 'Pending']] as const}>
                {([key, label]) => (
                  <button
                    class={`px-3 py-1 text-xs rounded-md cursor-pointer transition-colors ${filter() === key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    onClick={() => setFilter(key)}
                  >{label}</button>
                )}
              </For>
            </div>
          </div>

          <div class="space-y-3">
            <For each={filtered()}>
              {(rec) => (
                <div class="border rounded-lg p-4">
                  <div class="flex items-start justify-between">
                    <div class="flex-1">
                      <div class="flex items-center gap-2 mb-1">
                        <span class={`text-xs px-2 py-0.5 rounded-full ${typeColors[rec.type]}`}>{rec.type}</span>
                        <Show when={rec.quickWin}><span class="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">quick win</span></Show>
                        <span class={`text-xs px-2 py-0.5 rounded-full ${statusBadge[rec.status]}`}>{rec.status}</span>
                      </div>
                      <h3 class="text-sm font-medium text-gray-900">{rec.title}</h3>
                      <p class="text-xs text-gray-400 mt-1">{rec.process} &middot; affects {rec.affected} people</p>
                    </div>
                    <div class="text-right shrink-0 ml-4">
                      <span class="block text-sm font-semibold text-emerald-600">{rec.savings}</span>
                      <span class="text-xs text-gray-400">{rec.hours}</span>
                    </div>
                  </div>
                  <Show when={rec.status === 'pending'}>
                    <div class="flex gap-2 mt-3 pt-3 border-t">
                      <button class="px-3 py-1 text-xs bg-emerald-50 text-emerald-700 rounded cursor-pointer hover:bg-emerald-100">Accept</button>
                      <button class="px-3 py-1 text-xs bg-red-50 text-red-700 rounded cursor-pointer hover:bg-red-100">Reject</button>
                      <button class="px-3 py-1 text-xs bg-gray-50 text-gray-600 rounded cursor-pointer hover:bg-gray-100">Comment</button>
                    </div>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>
    </main>
  );
}
