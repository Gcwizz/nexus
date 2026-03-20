import { A } from '@solidjs/router';

export default function Graph() {
  return (
    <main class="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8">
      <A href="/" class="text-sm text-gray-400 hover:text-gray-600 mb-8 self-start py-2 inline-flex items-center min-h-[44px]">
        &larr; Back to Dashboard
      </A>

      <div class="flex flex-col items-center text-center max-w-md">
        <span class="text-xs font-mono text-gray-400 mb-2">Module 3</span>
        <h1 class="text-3xl font-bold tracking-tight text-gray-900 mb-2">
          Knowledge Graph Visualiser
        </h1>
        <p class="text-gray-500 mb-8">
          Explore your organisation's knowledge graph in an interactive 3D visualisation.
        </p>

        <div class="border-2 border-dashed border-gray-300 rounded-xl p-12 w-full flex flex-col items-center gap-4">
          <span class="text-gray-400 text-sm">No graph data available yet</span>
        </div>
      </div>
    </main>
  );
}
