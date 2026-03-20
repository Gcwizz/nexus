import { A } from '@solidjs/router';

export default function Canvas() {
  return (
    <main class="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8">
      <A href="/" class="text-sm text-gray-400 hover:text-gray-600 mb-8 self-start py-2 inline-flex items-center min-h-[44px]">
        &larr; Back to Dashboard
      </A>

      <div class="flex flex-col items-center text-center max-w-md">
        <span class="text-xs font-mono text-gray-400 mb-2">Module 4</span>
        <h1 class="text-3xl font-bold tracking-tight text-gray-900 mb-2">
          Process Canvas
        </h1>
        <p class="text-gray-500 mb-8">
          Visualise and edit your business processes on a collaborative real-time canvas.
        </p>

        <div class="border-2 border-dashed border-gray-300 rounded-xl p-12 w-full flex flex-col items-center gap-4">
          <span class="text-gray-400 text-sm">No processes mapped yet</span>
        </div>
      </div>
    </main>
  );
}
