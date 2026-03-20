import { A } from '@solidjs/router';
import { createSignal, For, Show } from 'solid-js';

const mockCollaborators = [
  { name: 'Sarah K.', color: 'bg-pink-500', cursor: { x: 340, y: 120 } },
  { name: 'James M.', color: 'bg-cyan-500', cursor: { x: 520, y: 200 } },
];

const mockChanges = [
  { user: 'Sarah K.', action: 'Added "Auto-qualify" step', time: '3 min ago', type: 'add' as const },
  { user: 'James M.', action: 'Removed manual approval gate', time: '7 min ago', type: 'remove' as const },
  { user: 'You', action: 'Moved "Send proposal" after qualification', time: '12 min ago', type: 'modify' as const },
  { user: 'Sarah K.', action: 'Added parallel path for fast-track deals', time: '18 min ago', type: 'add' as const },
];

const mockImpact = [
  { element: 'Auto-qualify step', department: 'Sales', severity: 'low' as const, detail: 'Reduces manual triage by ~4 hrs/wk' },
  { element: 'Remove approval gate', department: 'Management', severity: 'high' as const, detail: 'Skips manager sign-off for deals under £5k' },
  { element: 'Parallel fast-track', department: 'Sales + Finance', severity: 'medium' as const, detail: 'Cross-dept coordination needed for parallel paths' },
];

const changeColors = { add: 'text-emerald-600', remove: 'text-red-600', modify: 'text-amber-600' };
const severityColors = { low: 'bg-emerald-100 text-emerald-700', medium: 'bg-amber-100 text-amber-700', high: 'bg-red-100 text-red-700' };

export default function Design() {
  const [tab, setTab] = createSignal<'changes' | 'impact'>('changes');

  return (
    <main class="min-h-screen bg-gray-50">
      <div class="p-4 border-b bg-white flex items-center justify-between">
        <div class="flex items-center gap-4">
          <A href="/" class="text-sm text-gray-400 hover:text-gray-600 py-2 inline-flex items-center min-h-[44px]">&larr;</A>
          <div>
            <span class="text-xs font-mono text-gray-400">Module 6</span>
            <h1 class="text-lg font-bold text-gray-900">Target State Designer</h1>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-1">
            <For each={mockCollaborators}>
              {(c) => (
                <div class={`w-6 h-6 rounded-full ${c.color} text-white text-[10px] flex items-center justify-center font-medium`} title={c.name}>
                  {c.name.split(' ').map(n => n[0]).join('')}
                </div>
              )}
            </For>
            <span class="text-xs text-gray-400 ml-1">2 editing</span>
          </div>
          <button class="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-md cursor-pointer hover:bg-gray-200">Generate video</button>
          <button class="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-md cursor-pointer hover:bg-emerald-700">Request approval</button>
        </div>
      </div>

      <div class="flex h-[calc(100vh-73px)]">
        {/* Canvas area with diff overlay */}
        <div class="flex-1 bg-white relative overflow-hidden">
          {/* Mock BPMN canvas with diff colors */}
          <div class="absolute inset-0 flex items-center justify-center">
            <div class="relative" style="width: 700px; height: 300px;">
              {/* Current state steps */}
              <div class="absolute left-[40px] top-[60px] w-28 h-12 bg-white border border-gray-300 rounded-md flex items-center justify-center text-xs text-gray-700 shadow-sm">
                Qualify lead
              </div>
              <div class="absolute left-[200px] top-[60px] w-28 h-12 bg-emerald-50 border-2 border-emerald-400 rounded-md flex items-center justify-center text-xs text-emerald-700 shadow-sm">
                Auto-qualify
                <span class="absolute -top-3 -right-2 text-[9px] bg-emerald-500 text-white px-1 rounded">NEW</span>
              </div>
              <div class="absolute left-[360px] top-[60px] w-28 h-12 bg-white border border-gray-300 rounded-md flex items-center justify-center text-xs text-gray-700 shadow-sm">
                Send proposal
              </div>
              <div class="absolute left-[360px] top-[150px] w-28 h-12 bg-red-50 border-2 border-red-300 rounded-md flex items-center justify-center text-xs text-red-400 line-through shadow-sm">
                Mgr approval
                <span class="absolute -top-3 -right-2 text-[9px] bg-red-500 text-white px-1 rounded">DEL</span>
              </div>
              <div class="absolute left-[520px] top-[60px] w-28 h-12 bg-amber-50 border-2 border-amber-400 rounded-md flex items-center justify-center text-xs text-amber-700 shadow-sm">
                Create invoice
                <span class="absolute -top-3 -right-2 text-[9px] bg-amber-500 text-white px-1 rounded">MOD</span>
              </div>

              {/* Collaborator cursors */}
              <For each={mockCollaborators}>
                {(c) => (
                  <div class="absolute pointer-events-none" style={`left: ${c.cursor.x}px; top: ${c.cursor.y}px;`}>
                    <div class={`w-3 h-3 ${c.color} rounded-full`} />
                    <span class={`text-[9px] ${c.color} text-white px-1 py-0.5 rounded ml-2 whitespace-nowrap`} style={`background: var(--tw-gradient-from, currentColor);`}>
                      {c.name}
                    </span>
                  </div>
                )}
              </For>

              {/* Flow arrows */}
              <svg class="absolute inset-0" viewBox="0 0 700 300">
                <line x1="168" y1="66" x2="198" y2="66" stroke="#94a3b8" stroke-width="1.5" marker-end="url(#arr)" />
                <line x1="328" y1="66" x2="358" y2="66" stroke="#94a3b8" stroke-width="1.5" marker-end="url(#arr)" />
                <line x1="488" y1="66" x2="518" y2="66" stroke="#94a3b8" stroke-width="1.5" marker-end="url(#arr)" />
                <defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" /></marker></defs>
              </svg>
            </div>
          </div>

          <div class="absolute bottom-4 left-4 flex gap-3 text-[10px] text-gray-500">
            <span class="flex items-center gap-1"><span class="w-3 h-3 rounded border-2 border-emerald-400 bg-emerald-50" /> Added</span>
            <span class="flex items-center gap-1"><span class="w-3 h-3 rounded border-2 border-red-300 bg-red-50" /> Removed</span>
            <span class="flex items-center gap-1"><span class="w-3 h-3 rounded border-2 border-amber-400 bg-amber-50" /> Modified</span>
          </div>
        </div>

        {/* Right panel */}
        <div class="w-72 border-l bg-white overflow-y-auto">
          <div class="flex border-b">
            <button class={`flex-1 px-3 py-2.5 text-xs font-medium cursor-pointer ${tab() === 'changes' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-400'}`} onClick={() => setTab('changes')}>Changes</button>
            <button class={`flex-1 px-3 py-2.5 text-xs font-medium cursor-pointer ${tab() === 'impact' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-400'}`} onClick={() => setTab('impact')}>Impact</button>
          </div>

          <Show when={tab() === 'changes'}>
            <div class="p-4 space-y-3">
              <div class="flex gap-4 text-xs text-gray-500 mb-2">
                <span class="text-emerald-600">+2 added</span>
                <span class="text-red-600">-1 removed</span>
                <span class="text-amber-600">~1 modified</span>
              </div>
              <For each={mockChanges}>
                {(change) => (
                  <div class="py-2 border-b border-gray-100 last:border-0">
                    <div class="flex items-center gap-2">
                      <span class={`text-xs font-medium ${changeColors[change.type]}`}>{change.type === 'add' ? '+' : change.type === 'remove' ? '-' : '~'}</span>
                      <span class="text-sm text-gray-900">{change.action}</span>
                    </div>
                    <span class="text-xs text-gray-400">{change.user} &middot; {change.time}</span>
                  </div>
                )}
              </For>
            </div>
          </Show>

          <Show when={tab() === 'impact'}>
            <div class="p-4 space-y-3">
              <For each={mockImpact}>
                {(item) => (
                  <div class="py-2 border-b border-gray-100 last:border-0">
                    <div class="flex items-center gap-2 mb-1">
                      <span class="text-sm font-medium text-gray-900">{item.element}</span>
                      <span class={`text-xs px-2 py-0.5 rounded-full ${severityColors[item.severity]}`}>{item.severity}</span>
                    </div>
                    <span class="text-xs text-gray-500">{item.department}</span>
                    <p class="text-xs text-gray-400 mt-0.5">{item.detail}</p>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>
    </main>
  );
}
