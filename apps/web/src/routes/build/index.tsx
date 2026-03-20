import { A } from '@solidjs/router';
import { createSignal, For, Show } from 'solid-js';

const mockAgents = [
  { module: 'Sales Pipeline Manager', status: 'complete' as const, files: 42, tests: { total: 38, pass: 38, fail: 0 }, tokens: '124k' },
  { module: 'Invoice Automation', status: 'testing' as const, files: 28, tests: { total: 24, pass: 21, fail: 3 }, tokens: '89k' },
  { module: 'HR Onboarding Portal', status: 'generating' as const, files: 15, tests: { total: 0, pass: 0, fail: 0 }, tokens: '56k' },
  { module: 'Vendor Management', status: 'queued' as const, files: 0, tests: { total: 0, pass: 0, fail: 0 }, tokens: '0' },
  { module: 'Customer Support Desk', status: 'queued' as const, files: 0, tests: { total: 0, pass: 0, fail: 0 }, tokens: '0' },
];

const mockLog = [
  { level: 'success' as const, message: 'Sales Pipeline Manager: all 38 tests passing', agent: 'agent-1', time: '2 min ago' },
  { level: 'error' as const, message: 'Invoice Automation: 3 test failures in payment webhook handler', agent: 'agent-2', time: '5 min ago' },
  { level: 'info' as const, message: 'Invoice Automation: retrying failed tests with fix...', agent: 'agent-2', time: '4 min ago' },
  { level: 'info' as const, message: 'HR Onboarding Portal: generating screens (3/7)...', agent: 'agent-3', time: '1 min ago' },
  { level: 'success' as const, message: 'Sales Pipeline Manager: security scan passed — 0 findings', agent: 'agent-1', time: '8 min ago' },
  { level: 'info' as const, message: 'HR Onboarding Portal: generating API endpoints...', agent: 'agent-3', time: '6 min ago' },
  { level: 'success' as const, message: 'Sales Pipeline Manager: type-check passed', agent: 'agent-1', time: '10 min ago' },
  { level: 'warn' as const, message: 'Invoice Automation: complexity score 8.2 (threshold: 10)', agent: 'agent-2', time: '12 min ago' },
];

const mockQuality = {
  tests: { total: 62, passed: 59, failed: 3, skipped: 0 },
  typeCheck: 'pass' as const,
  security: { status: 'pass' as const, findings: 0 },
  complexity: { avg: 4.8, max: 8.2, highFiles: 2 },
};

const statusColors = {
  complete: 'bg-emerald-500', testing: 'bg-blue-500 animate-pulse', generating: 'bg-amber-500 animate-pulse',
  queued: 'bg-gray-300', failed: 'bg-red-500', blocked: 'bg-red-300',
};
const statusLabels = { complete: 'Complete', testing: 'Testing', generating: 'Building', queued: 'Queued', failed: 'Failed', blocked: 'Blocked' };
const logColors = { success: 'bg-emerald-500', error: 'bg-red-500', warn: 'bg-amber-500', info: 'bg-blue-500' };

export default function Build() {
  const [tab, setTab] = createSignal<'log' | 'quality'>('log');
  const completedModules = mockAgents.filter(a => a.status === 'complete').length;
  const totalTokens = mockAgents.reduce((s, a) => s + parseInt(a.tokens.replace('k', '')) * 1000, 0);

  return (
    <main class="min-h-screen bg-gray-50 p-8">
      <A href="/" class="text-sm text-gray-400 hover:text-gray-600 py-2 inline-flex items-center min-h-[44px]">&larr; Back to Dashboard</A>

      <div class="max-w-5xl mx-auto mt-4">
        <div class="mb-8">
          <span class="text-xs font-mono text-gray-400">Module 8</span>
          <h1 class="text-3xl font-bold tracking-tight text-gray-900">Autonomous Build Engine</h1>
          <p class="text-gray-500 mt-1">{completedModules} of {mockAgents.length} modules built &middot; 3 agents active</p>
        </div>

        {/* Progress bar */}
        <div class="bg-white border rounded-lg p-5 mb-6">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-medium text-gray-900">Build progress</span>
            <span class="text-xs text-gray-400">SCAFFOLDING → GENERATING → <span class="font-semibold text-blue-600">TESTING</span> → REVIEWING → PIPELINE</span>
          </div>
          <div class="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
            <div class="h-full bg-blue-500 rounded-full transition-all" style="width: 55%;" />
          </div>
          <div class="flex justify-between mt-2 text-xs text-gray-400">
            <span>{completedModules}/{mockAgents.length} modules</span>
            <span>{(totalTokens / 1000).toFixed(0)}k tokens used (limit: 500k)</span>
          </div>
        </div>

        {/* Agent status grid */}
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <For each={mockAgents}>
            {(agent) => (
              <div class="bg-white border rounded-lg p-4">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-sm font-medium text-gray-900">{agent.module}</span>
                  <span class="flex items-center gap-1.5 text-xs text-gray-500">
                    <span class={`w-2 h-2 rounded-full ${statusColors[agent.status]}`} />
                    {statusLabels[agent.status]}
                  </span>
                </div>
                <div class="grid grid-cols-3 gap-2 text-xs">
                  <div><span class="text-gray-400">Files</span><span class="block font-medium text-gray-900">{agent.files}</span></div>
                  <div>
                    <span class="text-gray-400">Tests</span>
                    <span class="block font-medium">
                      <Show when={agent.tests.total > 0} fallback={<span class="text-gray-300">—</span>}>
                        <span class="text-emerald-600">{agent.tests.pass}</span>
                        <Show when={agent.tests.fail > 0}>/<span class="text-red-600">{agent.tests.fail}</span></Show>
                      </Show>
                    </span>
                  </div>
                  <div><span class="text-gray-400">Tokens</span><span class="block font-medium text-gray-900">{agent.tokens}</span></div>
                </div>
                <Show when={agent.status === 'complete'}>
                  <button class="mt-3 w-full text-xs text-blue-600 hover:text-blue-800 cursor-pointer text-left">Review code →</button>
                </Show>
              </div>
            )}
          </For>
        </div>

        {/* Build log / Quality gates */}
        <div class="bg-white border rounded-lg overflow-hidden">
          <div class="flex border-b">
            <button class={`px-4 py-2.5 text-xs font-medium cursor-pointer ${tab() === 'log' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-400'}`} onClick={() => setTab('log')}>Build log</button>
            <button class={`px-4 py-2.5 text-xs font-medium cursor-pointer ${tab() === 'quality' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-400'}`} onClick={() => setTab('quality')}>Quality gates</button>
          </div>

          <Show when={tab() === 'log'}>
            <div class="p-4 space-y-2 max-h-80 overflow-y-auto font-mono">
              <For each={mockLog}>
                {(entry) => (
                  <div class="flex items-start gap-2 text-xs">
                    <span class={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${logColors[entry.level]}`} />
                    <span class="text-gray-400 shrink-0">[{entry.agent}]</span>
                    <span class="text-gray-700 flex-1">{entry.message}</span>
                    <span class="text-gray-400 shrink-0">{entry.time}</span>
                  </div>
                )}
              </For>
            </div>
          </Show>

          <Show when={tab() === 'quality'}>
            <div class="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div class="bg-gray-50 rounded-md p-3">
                <span class="text-xs text-gray-500">Tests</span>
                <span class="block text-lg font-bold text-gray-900">{mockQuality.tests.passed}/{mockQuality.tests.total}</span>
                <Show when={mockQuality.tests.failed > 0}>
                  <span class="text-xs text-red-600">{mockQuality.tests.failed} failing</span>
                </Show>
              </div>
              <div class="bg-gray-50 rounded-md p-3">
                <span class="text-xs text-gray-500">Type-check</span>
                <span class="block text-lg font-bold text-emerald-600">PASS</span>
              </div>
              <div class="bg-gray-50 rounded-md p-3">
                <span class="text-xs text-gray-500">Security scan</span>
                <span class="block text-lg font-bold text-emerald-600">PASS</span>
                <span class="text-xs text-gray-400">0 findings</span>
              </div>
              <div class="bg-gray-50 rounded-md p-3">
                <span class="text-xs text-gray-500">Complexity</span>
                <span class="block text-lg font-bold text-gray-900">{mockQuality.complexity.avg}</span>
                <span class="text-xs text-gray-400">max: {mockQuality.complexity.max}</span>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </main>
  );
}
