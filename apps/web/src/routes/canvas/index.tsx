import { A } from '@solidjs/router';
import { createSignal, For, Show } from 'solid-js';

const mockProcesses = [
  { name: 'Lead to Customer', department: 'Sales', steps: 12, bottlenecks: 2, savings: '£18,200/yr' },
  { name: 'Invoice to Payment', department: 'Finance', steps: 8, bottlenecks: 1, savings: '£9,400/yr' },
  { name: 'Employee Onboarding', department: 'HR', steps: 15, bottlenecks: 3, savings: '£12,800/yr' },
  { name: 'Support Ticket Resolution', department: 'Operations', steps: 7, bottlenecks: 1, savings: '£6,200/yr' },
  { name: 'Vendor Procurement', department: 'Finance', steps: 10, bottlenecks: 2, savings: '£14,600/yr' },
];

const swimlaneSteps = [
  { id: 1, lane: 'Sales Rep', label: 'Qualify lead', type: 'task' as const, x: 80, y: 40, savings: null },
  { id: 2, lane: 'Sales Rep', label: 'Demo call', type: 'task' as const, x: 220, y: 40, savings: '2 hrs/wk' },
  { id: 3, lane: 'Sales Rep', label: 'Send proposal', type: 'task' as const, x: 360, y: 40, savings: null },
  { id: 4, lane: 'Manager', label: 'Approve?', type: 'decision' as const, x: 500, y: 130, savings: null },
  { id: 5, lane: 'Manager', label: 'Review deal', type: 'task' as const, x: 360, y: 130, savings: '3 hrs/wk' },
  { id: 6, lane: 'Finance', label: 'Create invoice', type: 'task' as const, x: 640, y: 220, savings: '5 hrs/wk' },
  { id: 7, lane: 'Finance', label: 'Send to client', type: 'task' as const, x: 780, y: 220, savings: null },
];

export default function Canvas() {
  const [selectedProcess, setSelectedProcess] = createSignal(0);
  const [showROI, setShowROI] = createSignal(true);

  return (
    <main class="min-h-screen bg-gray-50">
      <div class="p-4 border-b bg-white flex items-center justify-between">
        <div class="flex items-center gap-4">
          <A href="/" class="text-sm text-gray-400 hover:text-gray-600 py-2 inline-flex items-center min-h-[44px]">&larr;</A>
          <div>
            <span class="text-xs font-mono text-gray-400">Module 4</span>
            <h1 class="text-lg font-bold text-gray-900">Process Canvas</h1>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <label class="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={showROI()} onChange={(e) => setShowROI(e.target.checked)} class="rounded" />
            Show ROI overlay
          </label>
          <button class="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-md cursor-pointer hover:bg-gray-200">Export BPMN</button>
          <button class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md cursor-pointer hover:bg-blue-700">Run simulation</button>
        </div>
      </div>

      <div class="flex h-[calc(100vh-73px)]">
        {/* Left sidebar — process list */}
        <div class="w-64 border-r bg-white p-4 overflow-y-auto">
          <h3 class="text-xs font-semibold text-gray-500 uppercase mb-3">Processes ({mockProcesses.length})</h3>
          <div class="space-y-1">
            <For each={mockProcesses}>
              {(proc, i) => (
                <button
                  class={`w-full text-left p-3 rounded-md cursor-pointer transition-colors ${
                    selectedProcess() === i() ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'
                  }`}
                  onClick={() => setSelectedProcess(i())}
                >
                  <span class="text-sm font-medium text-gray-900 block">{proc.name}</span>
                  <span class="text-xs text-gray-400">{proc.department} &middot; {proc.steps} steps</span>
                  <Show when={proc.bottlenecks > 0}>
                    <span class="block text-xs text-red-500 mt-1">{proc.bottlenecks} bottleneck{proc.bottlenecks > 1 ? 's' : ''}</span>
                  </Show>
                </button>
              )}
            </For>
          </div>
        </div>

        {/* Center — canvas */}
        <div class="flex-1 bg-white overflow-auto relative">
          {/* Swimlane headers */}
          <div class="sticky left-0 top-0 z-10">
            <div class="h-[100px] bg-blue-50 border-b flex items-center px-4">
              <span class="text-xs font-semibold text-blue-700 w-20">Sales Rep</span>
            </div>
            <div class="h-[100px] bg-purple-50 border-b flex items-center px-4">
              <span class="text-xs font-semibold text-purple-700 w-20">Manager</span>
            </div>
            <div class="h-[100px] bg-emerald-50 border-b flex items-center px-4">
              <span class="text-xs font-semibold text-emerald-700 w-20">Finance</span>
            </div>
          </div>

          {/* Process steps overlaid on swimlanes */}
          <div class="absolute inset-0 pointer-events-none" style="min-width: 900px;">
            <svg class="w-full h-full" viewBox="0 0 900 300">
              {/* Flows */}
              <line x1="130" y1="50" x2="200" y2="50" stroke="#94a3b8" stroke-width="1.5" marker-end="url(#arrow)" />
              <line x1="290" y1="50" x2="340" y2="50" stroke="#94a3b8" stroke-width="1.5" marker-end="url(#arrow)" />
              <line x1="420" y1="50" x2="420" y2="140" stroke="#94a3b8" stroke-width="1.5" />
              <line x1="420" y1="140" x2="460" y2="140" stroke="#94a3b8" stroke-width="1.5" marker-end="url(#arrow)" />
              <line x1="540" y1="140" x2="600" y2="230" stroke="#94a3b8" stroke-width="1.5" marker-end="url(#arrow)" />
              <line x1="700" y1="230" x2="740" y2="230" stroke="#94a3b8" stroke-width="1.5" marker-end="url(#arrow)" />
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
                </marker>
              </defs>
            </svg>

            <For each={swimlaneSteps}>
              {(step) => {
                const isDecision = step.type === 'decision';
                return (
                  <div
                    class={`absolute pointer-events-auto cursor-pointer ${
                      isDecision ? 'w-16 h-16' : 'w-24 h-12'
                    }`}
                    style={`left: ${step.x}px; top: ${step.y}px;`}
                  >
                    <div class={`w-full h-full flex items-center justify-center text-xs text-gray-700 font-medium ${
                      isDecision ? 'bg-amber-50 border-2 border-amber-300 rotate-45' : 'bg-white border border-gray-300 rounded-md shadow-sm'
                    }`}>
                      <span class={isDecision ? '-rotate-45' : ''}>{step.label}</span>
                    </div>
                    <Show when={showROI() && step.savings}>
                      <span class="absolute -top-5 left-0 text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded whitespace-nowrap">
                        {step.savings}
                      </span>
                    </Show>
                  </div>
                );
              }}
            </For>
          </div>
        </div>

        {/* Right sidebar — process info */}
        <div class="w-56 border-l bg-white p-4 overflow-y-auto">
          <h3 class="text-sm font-semibold text-gray-900 mb-3">{mockProcesses[selectedProcess()].name}</h3>
          <div class="space-y-3 text-sm">
            <div class="flex justify-between"><span class="text-gray-500">Steps</span><span class="text-gray-900">{mockProcesses[selectedProcess()].steps}</span></div>
            <div class="flex justify-between"><span class="text-gray-500">Bottlenecks</span><span class="text-red-600">{mockProcesses[selectedProcess()].bottlenecks}</span></div>
            <div class="flex justify-between"><span class="text-gray-500">Potential savings</span><span class="text-emerald-600 font-medium">{mockProcesses[selectedProcess()].savings}</span></div>
            <div class="flex justify-between"><span class="text-gray-500">Department</span><span class="text-gray-900">{mockProcesses[selectedProcess()].department}</span></div>
          </div>
          <div class="mt-6 pt-4 border-t">
            <h4 class="text-xs text-gray-500 font-medium mb-2">Simulation results</h4>
            <div class="space-y-2 text-xs text-gray-600">
              <div>Avg completion: <span class="font-medium">4.2 days</span></div>
              <div>Bottleneck at: <span class="font-medium text-red-600">Manager approval</span></div>
              <div>Automation ready: <span class="font-medium text-emerald-600">3 of 12 steps</span></div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
