import { fetchGraphData, fetchEntityDetail, fetchClusters } from '../services/graph-data.service.js';
import { searchEntities } from '../services/search.service.js';
import { generateSummary } from '../services/summary.service.js';

// ── Types ─────────────────────────────────────────────────────────

interface RouteParams {
  orgId: string;
  entityId?: string;
}

interface RequestContext {
  params: RouteParams;
  request: Request;
}

// ── Helpers ───────────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, status);
}

function getSearchParams(request: Request): URLSearchParams {
  return new URL(request.url).searchParams;
}

// ── Route: GET /api/graph/:orgId ──────────────────────────────────
// Returns full graph data for 3d-force-graph rendering

export async function getGraph(ctx: RequestContext): Promise<Response> {
  const { orgId } = ctx.params;
  if (!orgId) return errorResponse('orgId is required', 400);

  const params = getSearchParams(ctx.request);
  const entityType = params.get('entityType') ?? undefined;
  const department = params.get('department') ?? undefined;
  const minConfidence = params.has('minConfidence')
    ? parseFloat(params.get('minConfidence')!)
    : undefined;
  const depth = params.has('depth') ? parseInt(params.get('depth')!, 10) : undefined;

  try {
    const data = await fetchGraphData(orgId, {
      entityType,
      department,
      minConfidence,
      depth,
    });
    return jsonResponse(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch graph data';
    return errorResponse(message, 500);
  }
}

// ── Route: GET /api/graph/:orgId/search?q= ────────────────────────
// Searches entities by name and properties

export async function searchGraph(ctx: RequestContext): Promise<Response> {
  const { orgId } = ctx.params;
  if (!orgId) return errorResponse('orgId is required', 400);

  const params = getSearchParams(ctx.request);
  const query = params.get('q');
  if (!query) return errorResponse('Search query "q" is required', 400);

  const limit = params.has('limit') ? parseInt(params.get('limit')!, 10) : undefined;
  const entityType = params.get('entityType') ?? undefined;
  const department = params.get('department') ?? undefined;

  try {
    const results = await searchEntities(orgId, query, {
      limit,
      entityType,
      department,
    });
    return jsonResponse({ results, total: results.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search failed';
    return errorResponse(message, 500);
  }
}

// ── Route: GET /api/graph/:orgId/entity/:entityId ─────────────────
// Returns entity detail with connections

export async function getEntityDetail(ctx: RequestContext): Promise<Response> {
  const { orgId, entityId } = ctx.params;
  if (!orgId) return errorResponse('orgId is required', 400);
  if (!entityId) return errorResponse('entityId is required', 400);

  try {
    const detail = await fetchEntityDetail(orgId, entityId);
    if (!detail) return errorResponse('Entity not found', 404);
    return jsonResponse(detail);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch entity detail';
    return errorResponse(message, 500);
  }
}

// ── Route: GET /api/graph/:orgId/summary ──────────────────────────
// Returns Business in Numbers summary data

export async function getSummary(ctx: RequestContext): Promise<Response> {
  const { orgId } = ctx.params;
  if (!orgId) return errorResponse('orgId is required', 400);

  try {
    const summary = await generateSummary(orgId);
    return jsonResponse(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate summary';
    return errorResponse(message, 500);
  }
}

// ── Route: GET /api/graph/:orgId/clusters ─────────────────────────
// Returns department clusters

export async function getClusters(ctx: RequestContext): Promise<Response> {
  const { orgId } = ctx.params;
  if (!orgId) return errorResponse('orgId is required', 400);

  try {
    const clusters = await fetchClusters(orgId);
    return jsonResponse({ clusters });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch clusters';
    return errorResponse(message, 500);
  }
}

// ── Route map (for registration in SolidStart) ───────────────────

export const graphRoutes = {
  'GET /api/graph/:orgId': getGraph,
  'GET /api/graph/:orgId/search': searchGraph,
  'GET /api/graph/:orgId/entity/:entityId': getEntityDetail,
  'GET /api/graph/:orgId/summary': getSummary,
  'GET /api/graph/:orgId/clusters': getClusters,
} as const;
