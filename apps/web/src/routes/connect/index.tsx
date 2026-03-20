import { A } from '@solidjs/router';

export default function Connect() {
  return (
    <main class="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8">
      <A href="/" class="text-sm text-gray-400 hover:text-gray-600 mb-8 self-start py-2 inline-flex items-center min-h-[44px]">
        &larr; Back to Dashboard
      </A>

      <div class="flex flex-col items-center text-center max-w-md">
        <span class="text-xs font-mono text-gray-400 mb-2">Module 1</span>
        <h1 class="text-3xl font-bold tracking-tight text-gray-900 mb-2">
          Universal Connector Hub
        </h1>
        <p class="text-gray-500 mb-8">
          Connect your SaaS tools, databases, and APIs to build a living digital twin of your business.
        </p>

        <div class="border-2 border-dashed border-gray-300 rounded-xl p-12 w-full flex flex-col items-center gap-4">
          <span class="text-gray-400 text-sm">No connectors configured yet</span>
          <button class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium cursor-pointer">
            Connect your first tool
          </button>
        </div>
      </div>
    </main>
  );
}
