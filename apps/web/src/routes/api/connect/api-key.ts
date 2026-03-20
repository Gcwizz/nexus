import type { APIEvent } from '@solidjs/start/server';
import { PipedriveProvider, getProvider } from '@nexus/connector-hub';

export async function POST({ request }: APIEvent) {
  let body: { provider?: string; apiKey?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { provider: providerName, apiKey } = body;

  if (!providerName || !apiKey) {
    return new Response(JSON.stringify({ error: 'provider and apiKey are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Validate the provider exists and supports API key auth
  let provider;
  try {
    provider = getProvider(providerName);
  } catch {
    return new Response(JSON.stringify({ error: `Unknown provider: ${providerName}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (provider.authType !== 'api_key') {
    return new Response(JSON.stringify({ error: `${providerName} does not support API key authentication` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Validate the API key against the provider
  const pipedriveProvider = provider as PipedriveProvider;
  const isValid = await pipedriveProvider.validateApiKey(apiKey);
  if (!isValid) {
    return new Response(JSON.stringify({ error: 'Invalid API key. Please check your key and try again.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // TODO: Get orgId from authenticated session via requireOrgAccess
  // For now, store the connection. In production this must be gated by auth.
  const sourceId = `src-${providerName}-${Date.now()}`;

  try {
    const { db, connectedSources } = await import('@nexus/db');
    await db().insert(connectedSources).values({
      id: sourceId,
      orgId: 'demo-org', // TODO: Replace with session orgId
      provider: providerName,
      displayName: provider.displayName,
      status: 'connected',
      credentials: { apiKey, authType: 'api_key' },
      entityCount: 0,
      createdAt: new Date(),
    });
  } catch (err) {
    console.error(`[api/connect/api-key] Failed to save source:`, err);
    return new Response(JSON.stringify({ error: 'Failed to save connection' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ sourceId, provider: providerName, status: 'connected' }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
}
