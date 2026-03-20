import { A } from '@solidjs/router';

export default function Build() {
  return (
    <main class="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8">
      <A href="/" class="text-sm text-gray-400 hover:text-gray-600 mb-8 self-start">
        &larr; Back to Dashboard
      </A>

      <div class="flex flex-col items-center text-center max-w-md">
        <span class="text-xs font-mono text-gray-400 mb-2">Module 8</span>
        <h1 class="text-3xl font-bold tracking-tight text-gray-900 mb-2">
          AI Build Engine
        </h1>
        <p class="text-gray-500 mb-8">
          Autonomously generate software from specifications using AI-powered code generation.
        </p>

        <div class="border-2 border-dashed border-gray-300 rounded-xl p-12 w-full flex flex-col items-center gap-4">
          <span class="text-gray-400 text-sm">No builds in progress</span>
        </div>
      </div>
    </main>
  );
}
