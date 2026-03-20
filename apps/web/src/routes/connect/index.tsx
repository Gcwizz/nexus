import { A } from '@solidjs/router';
import { createSignal, For, Show } from 'solid-js';

const mockConnectors = [
  { name: 'salesforce', displayName: 'Salesforce', status: 'synced' as const, entities: 2847, lastSync: '2 min ago', nextSync: '28 min' },
  { name: 'xero', displayName: 'Xero', status: 'syncing' as const, entities: 1203, lastSync: 'now', nextSync: '—' },
  { name: 'hubspot', displayName: 'HubSpot', status: 'error' as const, entities: 956, lastSync: '1 hr ago', nextSync: 'retry in 5 min' },
];

const mockFeed = [
  { type: 'success' as const, message: 'Salesforce: 47 new contacts ingested', time: '2 min ago' },
  { type: 'info' as const, message: 'Xero: syncing invoices (batch 3/8)...', time: 'just now' },
  { type: 'error' as const, message: 'HubSpot: OAuth token expired — auto-refresh failed', time: '1 hr ago' },
  { type: 'success' as const, message: 'Salesforce: 12 opportunities updated', time: '5 min ago' },
  { type: 'info' as const, message: 'Xero: 203 bank transactions extracted', time: '1 min ago' },
  { type: 'success' as const, message: 'Salesforce: full sync complete — 2,847 entities', time: '32 min ago' },
];

interface AvailableProvider {
  name: string;
  displayName: string;
  description: string;
  authType: 'oauth' | 'api_key';
}

const availableProviders: AvailableProvider[] = [
  { name: 'google-workspace', displayName: 'Google Workspace', description: 'Gmail, Calendar, Drive, Docs', authType: 'oauth' },
  { name: 'slack', displayName: 'Slack', description: 'Messages, channels, files', authType: 'oauth' },
  { name: 'jira', displayName: 'Jira', description: 'Issues, projects, sprints', authType: 'oauth' },
  { name: 'pipedrive', displayName: 'Pipedrive', description: 'Persons, organizations, deals, activities', authType: 'api_key' },
];

const statusColors = {
  synced: 'bg-emerald-500',
  syncing: 'bg-blue-500 animate-pulse',
  error: 'bg-red-500',
};

const statusLabels = {
  synced: 'Synced',
  syncing: 'Syncing…',
  error: 'Error',
};

export default function Connect() {
  const [showAddProvider, setShowAddProvider] = createSignal(false);
  const [apiKeyProvider, setApiKeyProvider] = createSignal<AvailableProvider | null>(null);
  const [apiKey, setApiKey] = createSignal('');
  const [connecting, setConnecting] = createSignal(false);
  const [connectError, setConnectError] = createSignal('');

  function handleProviderClick(p: AvailableProvider) {
    if (p.authType === 'api_key') {
      setApiKeyProvider(p);
      setApiKey('');
      setConnectError('');
    } else {
      window.location.href = `/connect/oauth?provider=${p.name}`;
    }
  }

  async function handleApiKeySubmit(e: SubmitEvent) {
    e.preventDefault();
    const provider = apiKeyProvider();
    const key = apiKey().trim();
    if (!provider || !key) return;

    setConnecting(true);
    setConnectError('');

    try {
      const resp = await fetch('/api/connect/api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: provider.name, apiKey: key }),
      });

      if (!resp.ok) {
        const data = await resp.json() as { error?: string };
        setConnectError(data.error ?? `Connection failed (HTTP ${resp.status})`);
        return;
      }

      // Success — refresh to show new source
      window.location.reload();
    } catch {
      setConnectError('Network error. Please try again.');
    } finally {
      setConnecting(false);
    }
  }

  return (
    <main class="min-h-screen bg-gray-50 p-8">
      <A href="/" class="text-sm text-gray-400 hover:text-gray-600 py-2 inline-flex items-center min-h-[44px]">
        &larr; Back to Dashboard
      </A>

      <div class="max-w-5xl mx-auto mt-4">
        <div class="flex items-start justify-between mb-8">
          <div>
            <span class="text-xs font-mono text-gray-400">Module 1</span>
            <h1 class="text-3xl font-bold tracking-tight text-gray-900">Universal Connector Hub</h1>
            <p class="text-gray-500 mt-1">3 tools connected &middot; 5,006 entities ingested</p>
          </div>
          <button
            class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium cursor-pointer"
            onClick={() => setShowAddProvider(!showAddProvider())}
          >
            + Add tool
          </button>
        </div>

        <Show when={showAddProvider()}>
          <div class="mb-6 p-4 bg-white border rounded-lg">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-semibold text-gray-900">
                {apiKeyProvider() ? `Connect ${apiKeyProvider()!.displayName}` : 'Available integrations'}
              </h3>
              <button
                class="text-xs text-gray-400 hover:text-gray-600 cursor-pointer"
                onClick={() => {
                  if (apiKeyProvider()) {
                    setApiKeyProvider(null);
                    setApiKey('');
                    setConnectError('');
                  } else {
                    setShowAddProvider(false);
                  }
                }}
              >
                {apiKeyProvider() ? 'Back' : 'Close'}
              </button>
            </div>

            <Show when={!apiKeyProvider()}>
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <For each={availableProviders}>
                  {(p) => (
                    <button
                      class="border rounded-md p-3 text-left hover:border-blue-400 hover:shadow-sm transition-all cursor-pointer"
                      onClick={() => handleProviderClick(p)}
                    >
                      <div class="flex items-center justify-between">
                        <span class="text-sm font-medium text-gray-900">{p.displayName}</span>
                        <span class="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                          {p.authType === 'oauth' ? 'OAuth' : 'API Key'}
                        </span>
                      </div>
                      <span class="block text-xs text-gray-500 mt-0.5">{p.description}</span>
                    </button>
                  )}
                </For>
              </div>
            </Show>

            <Show when={apiKeyProvider()}>
              {(provider) => (
                <form onSubmit={handleApiKeySubmit} class="space-y-3">
                  <div>
                    <label class="block text-xs font-medium text-gray-700 mb-1" for="api-key-input">
                      API Key
                    </label>
                    <input
                      id="api-key-input"
                      type="password"
                      placeholder="Paste your API key"
                      value={apiKey()}
                      onInput={(e) => setApiKey(e.currentTarget.value)}
                      class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      autocomplete="off"
                      required
                    />
                    <p class="text-xs text-gray-400 mt-1">
                      Find your API key in {provider().displayName} &rarr; Settings &rarr; Personal preferences &rarr; API.
                    </p>
                  </div>

                  <Show when={connectError()}>
                    <p class="text-xs text-red-600">{connectError()}</p>
                  </Show>

                  <button
                    type="submit"
                    disabled={connecting() || !apiKey().trim()}
                    class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {connecting() ? 'Connecting…' : `Connect ${provider().displayName}`}
                  </button>
                </form>
              )}
            </Show>
          </div>
        </Show>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
          <For each={mockConnectors}>
            {(c) => (
              <div class="bg-white border rounded-lg p-5">
                <div class="flex items-center justify-between mb-3">
                  <span class="text-base font-semibold text-gray-900">{c.displayName}</span>
                  <span class="flex items-center gap-1.5 text-xs text-gray-500">
                    <span class={`w-2 h-2 rounded-full ${statusColors[c.status]}`} />
                    {statusLabels[c.status]}
                  </span>
                </div>
                <div class="space-y-2 text-sm text-gray-500">
                  <div class="flex justify-between">
                    <span>Entities</span>
                    <span class="font-medium text-gray-900">{c.entities.toLocaleString()}</span>
                  </div>
                  <div class="flex justify-between">
                    <span>Last sync</span>
                    <span>{c.lastSync}</span>
                  </div>
                  <div class="flex justify-between">
                    <span>Next sync</span>
                    <span>{c.nextSync}</span>
                  </div>
                </div>
                <div class="mt-4 flex gap-2">
                  <button class="text-xs text-blue-600 hover:text-blue-800 cursor-pointer">Sync now</button>
                  <span class="text-gray-300">|</span>
                  <button class="text-xs text-gray-400 hover:text-gray-600 cursor-pointer">Settings</button>
                  <span class="text-gray-300">|</span>
                  <button class="text-xs text-red-400 hover:text-red-600 cursor-pointer">Disconnect</button>
                </div>
              </div>
            )}
          </For>
        </div>

        <div class="bg-white border rounded-lg p-5">
          <h2 class="text-sm font-semibold text-gray-900 mb-4">Ingestion feed</h2>
          <div class="space-y-3">
            <For each={mockFeed}>
              {(item) => (
                <div class="flex items-start gap-3 text-sm">
                  <span class={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${
                    item.type === 'success' ? 'bg-emerald-500' :
                    item.type === 'error' ? 'bg-red-500' : 'bg-blue-500'
                  }`} />
                  <span class="text-gray-700 flex-1">{item.message}</span>
                  <span class="text-xs text-gray-400 shrink-0">{item.time}</span>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>
    </main>
  );
}
