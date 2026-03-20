import { type APIEvent } from '@solidjs/start/server';
import { getQueue } from '@nexus/events';
import { ANALYSE_QUEUE } from '../workers/analyse.worker.js';
import {
  getRecommendations,
  getRecommendationById,
  updateRecommendationStatus,
  computeImpactAssessment,
} from '../services/recommendation.service.js';
import type { AnalyseJobData, RecommendationStatus } from '../types.js';
import { RecommendationNotFoundError, InvalidStatusTransitionError } from '../errors.js';

// ── POST /api/optimise/:orgId — Trigger analysis ────────────────

export async function POST(event: APIEvent): Promise<Response> {
  const orgId = event.params.orgId;

  if (!orgId) {
    return Response.json({ error: 'orgId is required' }, { status: 400 });
  }

  try {
    // Get canvasId from request body (optional — defaults to latest)
    let canvasId = 'latest';
    try {
      const body = await event.request.json();
      if (body.canvasId) canvasId = body.canvasId;
    } catch {
      // No body or invalid JSON — use defaults
    }

    const analyseQueue = getQueue(ANALYSE_QUEUE);
    const job = await analyseQueue.add(
      'analyse',
      {
        orgId,
        canvasId,
        triggeredBy: 'api',
      } satisfies AnalyseJobData,
      {
        jobId: `analyse-${orgId}-${canvasId}-${Date.now()}`,
        removeOnComplete: { age: 86400 },
        removeOnFail: { age: 604800 },
      },
    );

    return Response.json(
      {
        jobId: job.id,
        status: 'queued',
        message: `Optimisation analysis queued for org ${orgId}`,
      },
      { status: 202 },
    );
  } catch (error) {
    console.error(`[optimisation-engine] Failed to queue analysis for org ${orgId}:`, error);
    return Response.json(
      { error: 'Failed to queue analysis', message: (error as Error).message },
      { status: 500 },
    );
  }
}

// ── GET /api/optimise/:orgId/recommendations — Prioritised list ─

export async function GETRecommendations(event: APIEvent): Promise<Response> {
  const orgId = event.params.orgId;

  if (!orgId) {
    return Response.json({ error: 'orgId is required' }, { status: 400 });
  }

  try {
    const recs = await getRecommendations(orgId);

    // Parse query params for filtering
    const url = new URL(event.request.url);
    const typeFilter = url.searchParams.get('type');
    const impactFilter = url.searchParams.get('impact');
    const complexityFilter = url.searchParams.get('complexity');
    const quickWinsOnly = url.searchParams.get('quickWins') === 'true';
    const statusFilter = url.searchParams.get('status');

    let filtered = recs;

    if (typeFilter) {
      filtered = filtered.filter((r) => r.type === typeFilter);
    }
    if (impactFilter) {
      filtered = filtered.filter((r) => r.impact === impactFilter);
    }
    if (complexityFilter) {
      filtered = filtered.filter((r) => r.complexity === complexityFilter);
    }
    if (quickWinsOnly) {
      filtered = filtered.filter((r) => r.isQuickWin);
    }
    if (statusFilter) {
      filtered = filtered.filter((r) => r.status === statusFilter);
    }

    // Sort by priority score descending
    filtered.sort((a, b) => b.priorityScore - a.priorityScore);

    return Response.json({
      recommendations: filtered,
      total: filtered.length,
      quickWinCount: filtered.filter((r) => r.isQuickWin).length,
    });
  } catch (error) {
    console.error(`[optimisation-engine] Failed to get recommendations for org ${orgId}:`, error);
    return Response.json(
      { error: 'Failed to fetch recommendations', message: (error as Error).message },
      { status: 500 },
    );
  }
}

// ── GET /api/optimise/:orgId/recommendations/:id — Single detail ─

export async function GETRecommendationDetail(event: APIEvent): Promise<Response> {
  const { orgId, id } = event.params;

  if (!orgId || !id) {
    return Response.json({ error: 'orgId and id are required' }, { status: 400 });
  }

  try {
    const rec = await getRecommendationById(orgId, id);
    return Response.json({ recommendation: rec });
  } catch (error) {
    if (error instanceof RecommendationNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    console.error(`[optimisation-engine] Failed to get recommendation ${id}:`, error);
    return Response.json(
      { error: 'Failed to fetch recommendation', message: (error as Error).message },
      { status: 500 },
    );
  }
}

// ── GET /api/optimise/:orgId/impact — Aggregate impact assessment ─

export async function GETImpact(event: APIEvent): Promise<Response> {
  const orgId = event.params.orgId;

  if (!orgId) {
    return Response.json({ error: 'orgId is required' }, { status: 400 });
  }

  try {
    const assessment = await computeImpactAssessment(orgId);
    return Response.json({ impact: assessment });
  } catch (error) {
    console.error(`[optimisation-engine] Failed to compute impact for org ${orgId}:`, error);
    return Response.json(
      { error: 'Failed to compute impact assessment', message: (error as Error).message },
      { status: 500 },
    );
  }
}

// ── PATCH /api/optimise/:orgId/recommendations/:id — Accept/reject ─

export async function PATCHRecommendation(event: APIEvent): Promise<Response> {
  const { orgId, id } = event.params;

  if (!orgId || !id) {
    return Response.json({ error: 'orgId and id are required' }, { status: 400 });
  }

  try {
    const body = await event.request.json();
    const status = body.status as RecommendationStatus;

    if (!status || !['pending', 'accepted', 'rejected', 'implemented'].includes(status)) {
      return Response.json(
        { error: 'Valid status is required: pending, accepted, rejected, or implemented' },
        { status: 400 },
      );
    }

    const updated = await updateRecommendationStatus(orgId, id, status);
    return Response.json({ recommendation: updated });
  } catch (error) {
    if (error instanceof RecommendationNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof InvalidStatusTransitionError) {
      return Response.json({ error: error.message }, { status: 422 });
    }
    console.error(`[optimisation-engine] Failed to update recommendation ${id}:`, error);
    return Response.json(
      { error: 'Failed to update recommendation', message: (error as Error).message },
      { status: 500 },
    );
  }
}
