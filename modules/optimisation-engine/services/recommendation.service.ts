import { eq, and, desc } from 'drizzle-orm';
import { db, recommendations } from '@nexus/db';
import type { ProcessMap } from '@nexus/contracts/processes';
import type {
  Recommendation,
  RecommendationType,
  ImpactLevel,
  ComplexityLevel,
  EstimatedSavings,
  LeanAnalysisResult,
  BottleneckAnalysisResult,
  AutomationAnalysisResult,
  RecommendationAnnotation,
  ImpactAssessment,
  RecommendationStatus,
} from '../types.js';
import { RecommendationNotFoundError, InvalidStatusTransitionError } from '../errors.js';

// ── Priority Scoring ────────────────────────────────────────────

const IMPACT_WEIGHT: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

const COMPLEXITY_WEIGHT: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

const QUICK_WIN_BONUS = 1.5;

function computePriorityScore(
  impact: ImpactLevel,
  complexity: ComplexityLevel,
  isQuickWin: boolean,
): number {
  const impactScore = IMPACT_WEIGHT[impact];
  const complexityDivisor = COMPLEXITY_WEIGHT[complexity];
  const base = impactScore * (1 / complexityDivisor);
  return isQuickWin ? base * QUICK_WIN_BONUS : base;
}

function isQuickWin(impact: ImpactLevel, complexity: ComplexityLevel): boolean {
  return (
    (impact === 'high' || impact === 'medium') && complexity === 'low'
  );
}

// ── Recommendation Generation from LEAN Findings ────────────────

function generateLeanRecommendations(
  orgId: string,
  canvasId: string,
  lean: LeanAnalysisResult,
): Omit<Recommendation, 'id' | 'createdAt'>[] {
  return lean.findings.map((finding) => {
    const impact = finding.severity as ImpactLevel;
    const complexity: ComplexityLevel =
      finding.wasteType === 'waiting' || finding.wasteType === 'motion'
        ? 'low'
        : finding.wasteType === 'extra_processing' || finding.wasteType === 'overproduction'
          ? 'medium'
          : 'high';

    const quickWin = isQuickWin(impact, complexity);

    return {
      orgId,
      canvasId,
      type: 'lean' as RecommendationType,
      title: `Eliminate ${finding.wasteType.replace(/_/g, ' ')} waste: ${finding.description.slice(0, 60)}`,
      description: `${finding.description}\n\nEvidence: ${finding.evidence}\n\nSuggested fix: ${finding.suggestedFix}`,
      affectedProcesses: [finding.processId],
      impact,
      complexity,
      isQuickWin: quickWin,
      estimatedSavings: {},
      status: 'pending' as RecommendationStatus,
      priorityScore: computePriorityScore(impact, complexity, quickWin),
    };
  });
}

// ── Recommendation Generation from Bottleneck Findings ──────────

function generateBottleneckRecommendations(
  orgId: string,
  canvasId: string,
  bottleneck: BottleneckAnalysisResult,
): Omit<Recommendation, 'id' | 'createdAt'>[] {
  return bottleneck.findings.map((finding) => {
    const type: RecommendationType =
      finding.type === 'redundancy'
        ? 'redundancy'
        : finding.type === 'cross_dept_friction'
          ? 'cross_dept'
          : 'bottleneck';

    const impact = finding.severity as ImpactLevel;
    const complexity: ComplexityLevel =
      finding.type === 'redundancy' || finding.type === 'cross_dept_friction'
        ? 'high'
        : finding.type === 'queue_buildup'
          ? 'medium'
          : 'medium';

    const quickWin = isQuickWin(impact, complexity);

    const deptInfo =
      finding.fromDepartment && finding.toDepartment
        ? ` (${finding.fromDepartment} → ${finding.toDepartment})`
        : '';

    const affectedProcesses = finding.duplicateProcessIds?.length
      ? [finding.processId, ...finding.duplicateProcessIds]
      : [finding.processId];

    return {
      orgId,
      canvasId,
      type,
      title: `${finding.type.replace(/_/g, ' ')}: ${finding.description.slice(0, 60)}${deptInfo}`,
      description: `${finding.description}\n\nEvidence: ${finding.evidence}`,
      affectedProcesses,
      impact,
      complexity,
      isQuickWin: quickWin,
      estimatedSavings: {},
      status: 'pending' as RecommendationStatus,
      priorityScore: computePriorityScore(impact, complexity, quickWin),
    };
  });
}

// ── Recommendation Generation from Automation Scores ────────────

function generateAutomationRecommendations(
  orgId: string,
  canvasId: string,
  automation: AutomationAnalysisResult,
): Omit<Recommendation, 'id' | 'createdAt'>[] {
  // Only recommend steps that are automatable or need restructuring
  const actionableScores = automation.scores.filter(
    (s) => s.readiness !== 'not_suitable',
  );

  return actionableScores.map((score) => {
    const impact: ImpactLevel =
      score.overallScore >= 4.0 ? 'high' : score.overallScore >= 3.0 ? 'medium' : 'low';

    const complexity: ComplexityLevel =
      score.readiness === 'immediately_automatable' ? 'low' : 'medium';

    const quickWin = isQuickWin(impact, complexity);

    return {
      orgId,
      canvasId,
      type: 'automation' as RecommendationType,
      title: `${score.readiness === 'immediately_automatable' ? 'Automate' : 'Restructure then automate'}: ${score.stepName}`,
      description: `Automation readiness score: ${score.overallScore}/5\n\n` +
        `Structure: ${score.structure}/5 | Data quality: ${score.dataQuality}/5 | ` +
        `Decision complexity: ${score.decisionComplexity}/5 | Exception frequency: ${score.exceptionFrequency}/5\n\n` +
        `${score.rationale}`,
      affectedProcesses: [score.processId],
      impact,
      complexity,
      isQuickWin: quickWin,
      estimatedSavings: {},
      status: 'pending' as RecommendationStatus,
      priorityScore: computePriorityScore(impact, complexity, quickWin),
    };
  });
}

// ── Aggregate & Store ───────────────────────────────────────────

export async function generateAndStoreRecommendations(
  orgId: string,
  canvasId: string,
  lean: LeanAnalysisResult,
  bottleneck: BottleneckAnalysisResult,
  automation: AutomationAnalysisResult,
): Promise<Recommendation[]> {
  const allRecs = [
    ...generateLeanRecommendations(orgId, canvasId, lean),
    ...generateBottleneckRecommendations(orgId, canvasId, bottleneck),
    ...generateAutomationRecommendations(orgId, canvasId, automation),
  ];

  // Sort by priority score descending
  allRecs.sort((a, b) => b.priorityScore - a.priorityScore);

  const now = new Date();
  const storedRecs: Recommendation[] = [];

  for (const rec of allRecs) {
    const id = crypto.randomUUID();
    await db().insert(recommendations).values({
      id,
      orgId: rec.orgId,
      canvasId: rec.canvasId,
      type: rec.type,
      title: rec.title,
      description: rec.description,
      affectedProcesses: rec.affectedProcesses,
      impact: rec.impact,
      complexity: rec.complexity,
      isQuickWin: rec.isQuickWin,
      estimatedSavings: rec.estimatedSavings,
      status: rec.status,
    });

    storedRecs.push({
      ...rec,
      id,
      createdAt: now,
    });
  }

  return storedRecs;
}

// ── Canvas Annotations ──────────────────────────────────────────

export function generateCanvasAnnotations(
  recs: Recommendation[],
  processes: ProcessMap[],
): RecommendationAnnotation[] {
  const annotations: RecommendationAnnotation[] = [];

  for (const rec of recs) {
    // Find the first affected process and its relevant element
    for (const processId of rec.affectedProcesses) {
      const process = processes.find((p) => p.id === processId);
      if (!process) continue;

      // Pick the first task element as annotation anchor
      const taskElement = process.elements.find(
        (e) =>
          e.type === 'task' ||
          e.type === 'userTask' ||
          e.type === 'serviceTask',
      );

      annotations.push({
        id: crypto.randomUUID(),
        processId,
        elementId: taskElement?.id,
        text: `[${rec.type.toUpperCase()}] ${rec.title}`,
        author: 'optimisation-engine',
        createdAt: new Date().toISOString(),
        type: 'suggestion',
        recommendationId: rec.id,
        recommendationType: rec.type,
        impact: rec.impact,
      });

      break; // One annotation per recommendation
    }
  }

  return annotations;
}

// ── Query Functions ─────────────────────────────────────────────

export async function getRecommendations(
  orgId: string,
): Promise<Recommendation[]> {
  const rows = await db()
    .select()
    .from(recommendations)
    .where(eq(recommendations.orgId, orgId))
    .orderBy(desc(recommendations.createdAt));

  return rows.map(rowToRecommendation);
}

export async function getRecommendationById(
  orgId: string,
  id: string,
): Promise<Recommendation> {
  const rows = await db()
    .select()
    .from(recommendations)
    .where(and(eq(recommendations.orgId, orgId), eq(recommendations.id, id)));

  if (rows.length === 0) {
    throw new RecommendationNotFoundError(
      `Recommendation ${id} not found for org ${orgId}`,
      { orgId },
    );
  }

  return rowToRecommendation(rows[0]);
}

export async function updateRecommendationStatus(
  orgId: string,
  id: string,
  status: RecommendationStatus,
): Promise<Recommendation> {
  const existing = await getRecommendationById(orgId, id);

  // Validate status transitions
  const validTransitions: Record<string, string[]> = {
    pending: ['accepted', 'rejected'],
    accepted: ['implemented', 'rejected'],
    rejected: ['pending'],
    implemented: [],
  };

  if (!validTransitions[existing.status]?.includes(status)) {
    throw new InvalidStatusTransitionError(
      `Cannot transition from ${existing.status} to ${status}`,
      { orgId },
    );
  }

  await db()
    .update(recommendations)
    .set({ status })
    .where(and(eq(recommendations.orgId, orgId), eq(recommendations.id, id)));

  return { ...existing, status };
}

// ── Impact Assessment ───────────────────────────────────────────

export async function computeImpactAssessment(
  orgId: string,
  automationResult?: AutomationAnalysisResult,
): Promise<ImpactAssessment> {
  const recs = await getRecommendations(orgId);

  const byType: Record<string, number> = {};
  const byImpact: Record<string, number> = {};
  const byComplexity: Record<string, number> = {};
  let quickWinCount = 0;
  let totalHoursPerWeek = 0;
  let totalCostPerYear = 0;
  let totalAffectedPeople = 0;

  for (const rec of recs) {
    byType[rec.type] = (byType[rec.type] ?? 0) + 1;
    byImpact[rec.impact] = (byImpact[rec.impact] ?? 0) + 1;
    byComplexity[rec.complexity] = (byComplexity[rec.complexity] ?? 0) + 1;
    if (rec.isQuickWin) quickWinCount++;
    if (rec.estimatedSavings.hoursPerWeek) {
      totalHoursPerWeek += rec.estimatedSavings.hoursPerWeek;
    }
    if (rec.estimatedSavings.costPerYear) {
      totalCostPerYear += rec.estimatedSavings.costPerYear;
    }
    if (rec.estimatedSavings.affectedPeople) {
      totalAffectedPeople += rec.estimatedSavings.affectedPeople;
    }
  }

  return {
    orgId,
    totalRecommendations: recs.length,
    byType,
    byImpact,
    byComplexity,
    quickWinCount,
    totalEstimatedSavings: {
      hoursPerWeek: totalHoursPerWeek || undefined,
      costPerYear: totalCostPerYear || undefined,
      affectedPeople: totalAffectedPeople || undefined,
    },
    automationReadiness: automationResult
      ? {
          immediatelyAutomatable: automationResult.immediatelyAutomatableCount,
          needsRestructuring: automationResult.needsRestructuringCount,
          notSuitable: automationResult.notSuitableCount,
          averageScore: automationResult.averageReadinessScore,
        }
      : {
          immediatelyAutomatable: 0,
          needsRestructuring: 0,
          notSuitable: 0,
          averageScore: 0,
        },
  };
}

// ── Helpers ─────────────────────────────────────────────────────

function rowToRecommendation(row: typeof recommendations.$inferSelect): Recommendation {
  const impact = row.impact as ImpactLevel;
  const complexity = row.complexity as ComplexityLevel;
  const qw = row.isQuickWin;

  return {
    id: row.id,
    orgId: row.orgId,
    canvasId: row.canvasId,
    type: row.type as RecommendationType,
    title: row.title,
    description: row.description,
    affectedProcesses: (row.affectedProcesses as string[]) ?? [],
    impact,
    complexity,
    isQuickWin: qw,
    estimatedSavings: (row.estimatedSavings as EstimatedSavings) ?? {},
    status: row.status as RecommendationStatus,
    priorityScore: computePriorityScore(impact, complexity, qw),
    createdAt: row.createdAt,
  };
}
