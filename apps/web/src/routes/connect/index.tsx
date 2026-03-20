import { A } from '@solidjs/router';
import { createSignal, For, Show } from 'solid-js';

const providers = [
  { name: 'salesforce', displayName: 'Salesforce', description: 'CRM, contacts, opportunities, accounts' },
  { name: 'xero', displayName: 'Xero', description: 'Invoices, contacts, bank transactions' },
  { name: 'hubspot', displayName: 'HubSpot', description: 'Contacts, companies, deals, tickets' },
];

export default function Connect() {
  const [showProviders, setShowProviders] = createSignal(false);

  function handleProviderSelect(providerName: string) {
    window.location.href = `/connect/oauth?provider=${providerName}`;
  }

  return (
    <main class="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8">
      <A href="/" class="text-sm text-gray-400 hover:text-gray-600 mb-8 self-start py-2 inline-flex items-center min-h-[44px]">
        &larr; Back to Dashboard
      </A>

      <div class="flex flex-col items-center text-center max-w-md w-full">
        <span class="text-xs font-mono text-gray-400 mb-2">Module 1</span>
        <h1 class="text-3xl font-bold tracking-tight text-gray-900 mb-2">
          Universal Connector Hub
        </h1>
        <p class="text-gray-500 mb-8">
          Connect your SaaS tools, databases, and APIs to build a living digital twin of your business.
        </p>

        <Show when={!showProviders()}>
          <div class="border-2 border-dashed border-gray-300 rounded-xl p-12 w-full flex flex-col items-center gap-4">
            <svg class="w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.886-3.497 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
            </svg>
            <span class="text-gray-400 text-sm">No connectors configured yet</span>
            <button
              class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium cursor-pointer"
              onClick={() => setShowProviders(true)}
            >
              Connect your first tool
            </button>
          </div>
        </Show>

        <Show when={showProviders()}>
          <div class="w-full">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-lg font-semibold text-gray-900 text-left">Choose a provider</h2>
              <button
                class="text-sm text-gray-400 hover:text-gray-600 cursor-pointer"
                onClick={() => setShowProviders(false)}
              >
                Cancel
              </button>
            </div>
            <div class="flex flex-col gap-3">
              <For each={providers}>
                {(provider) => (
                  <button
                    class="border rounded-lg p-4 bg-white hover:border-blue-400 hover:shadow-md transition-all text-left cursor-pointer w-full"
                    onClick={() => handleProviderSelect(provider.name)}
                  >
                    <span class="text-sm font-semibold text-gray-900">{provider.displayName}</span>
                    <span class="block text-xs text-gray-500 mt-1">{provider.description}</span>
                  </button>
                )}
              </For>
            </div>
          </div>
        </Show>
      </div>
    </main>
  );
}
