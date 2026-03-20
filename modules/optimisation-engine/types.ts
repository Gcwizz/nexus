import { z } from 'zod';

// ── Analysis Scope ──────────────────────────────────────────────

export type AnalysisScope = 'process' | 'ontology' | 'cross-domain' | 'end-to-end';

export type RecommendationPriority = 'critical' | 'high' | 'medium' | 'low';

// ── LEAN Waste Types (8 Wastes - DOWNTIME mnemonic) ─────────────

export const LeanWasteType = z.enum([
  'defects',
  'overproduction',
  'waiting',
  'non_utilized_talent',
  'transportation',
  'inventory',
  'motion',
  'extra_processing',
]);

export type LeanWasteType = z.infer<typeof LeanWasteType>;

// ── LEAN Waste Finding ──────────────────────────────────────────

export const LeanWasteFinding = z.object({
  wasteType: LeanWasteType,
  description: z.string(),
  affectedStepIds: z.array(z.string()),
  processId: z.string(),
  severity: z.enum(['high', 'medium', 'low']),
  suggestedFix: z.string(),
  evidence: z.string(),
});

export type LeanWasteFinding = z.infer<typeof LeanWasteFinding>;

// ── LEAN Analysis Result ────────────────────────────────────────

export const LeanAnalysisResult = z.object({
  orgId: z.string(),
  findings: z.array(LeanWasteFinding),
  totalWasteCount: z.number(),
  wasteByType: z.record(LeanWasteType, z.number()),
  analysedProcessCount: z.number(),
});

export type LeanAnalysisResult = z.infer<typeof LeanAnalysisResult>;

// ── Bottleneck Finding ──────────────────────────────────────────

export const BottleneckFinding = z.object({
  type: z.enum(['queue_buildup', 'handoff_stall', 'cycle_time_disproportion', 'cross_dept_friction', 'redundancy']),
  description: z.string(),
  processId: z.string(),
  affectedStepIds: z.array(z.string()),
  severity: z.enum(['high', 'medium', 'low']),
  fromDepartment: z.string().optional(),
  toDepartment: z.string().optional(),
  duplicateProcessIds: z.array(z.string()).optional(),
  evidence: z.string(),
});

export type BottleneckFinding = z.infer<typeof BottleneckFinding>;

// ── Bottleneck Analysis Result ──────────────────────────────────

export const BottleneckAnalysisResult = z.object({
  orgId: z.string(),
  findings: z.array(BottleneckFinding),
  crossDeptFrictionCount: z.number(),
  redundancyCount: z.number(),
  bottleneckCount: z.number(),
});

export type BottleneckAnalysisResult = z.infer<typeof BottleneckAnalysisResult>;

// ── Automation Readiness Score ───────────────────────────────────

export const AutomationScore = z.object({
  processId: z.string(),
  stepId: z.string(),
  stepName: z.string(),
  structure: z.number().min(1).max(5),
  dataQuality: z.number().min(1).max(5),
  decisionComplexity: z.number().min(1).max(5),
  exceptionFrequency: z.number().min(1).max(5),
  overallScore: z.number().min(1).max(5),
  readiness: z.enum(['immediately_automatable', 'needs_restructuring', 'not_suitable']),
  rationale: z.string(),
});

export type AutomationScore = z.infer<typeof AutomationScore>;

// ── Automation Analysis Result ──────────────────────────────────

export const AutomationAnalysisResult = z.object({
  orgId: z.string(),
  scores: z.array(AutomationScore),
  immediatelyAutomatableCount: z.number(),
  needsRestructuringCount: z.number(),
  notSuitableCount: z.number(),
  averageReadinessScore: z.number(),
});

export type AutomationAnalysisResult = z.infer<typeof AutomationAnalysisResult>;

// ── Recommendation ──────────────────────────────────────────────

export const RecommendationType = z.enum([
  'lean',
  'bottleneck',
  'automation',
  'redundancy',
  'cross_dept',
]);

export type RecommendationType = z.infer<typeof RecommendationType>;

export const ImpactLevel = z.enum(['high', 'medium', 'low']);
export type ImpactLevel = z.infer<typeof ImpactLevel>;

export const ComplexityLevel = z.enum(['high', 'medium', 'low']);
export type ComplexityLevel = z.infer<typeof ComplexityLevel>;

export const RecommendationStatus = z.enum(['pending', 'accepted', 'rejected', 'implemented']);
export type RecommendationStatus = z.infer<typeof RecommendationStatus>;

export const EstimatedSavings = z.object({
  hoursPerWeek: z.number().optional(),
  costPerYear: z.number().optional(),
  affectedPeople: z.number().optional(),
});

export type EstimatedSavings = z.infer<typeof EstimatedSavings>;

export interface Recommendation {
  id: string;
  orgId: string;
  canvasId: string;
  type: RecommendationType;
  title: string;
  description: string;
  affectedProcesses: string[];
  impact: ImpactLevel;
  complexity: ComplexityLevel;
  isQuickWin: boolean;
  estimatedSavings: EstimatedSavings;
  status: RecommendationStatus;
  priorityScore: number;
  createdAt: Date;
}

// ── Canvas Annotation (for recommendation overlay) ──────────────

export interface RecommendationAnnotation {
  id: string;
  processId: string;
  elementId?: string;
  text: string;
  author: string;
  createdAt: string;
  type: 'suggestion';
  recommendationId: string;
  recommendationType: RecommendationType;
  impact: ImpactLevel;
}

// ── Impact Assessment ───────────────────────────────────────────

export interface ImpactAssessment {
  orgId: string;
  totalRecommendations: number;
  byType: Record<string, number>;
  byImpact: Record<string, number>;
  byComplexity: Record<string, number>;
  quickWinCount: number;
  totalEstimatedSavings: EstimatedSavings;
  automationReadiness: {
    immediatelyAutomatable: number;
    needsRestructuring: number;
    notSuitable: number;
    averageScore: number;
  };
}

// ── Analysis Pipeline Job Data ──────────────────────────────────

export interface AnalyseJobData {
  orgId: string;
  canvasId: string;
  triggeredBy: string;
}

// ── Analysis Options ────────────────────────────────────────────

export interface AnalysisOptions {
  scope: AnalysisScope;
  targetProcessIds?: string[];
  maxRecommendations?: number;
  includeImpactEstimates?: boolean;
}

// ── Analysis Result ─────────────────────────────────────────────

export interface AnalysisResult {
  id: string;
  scope: AnalysisScope;
  recommendations: Recommendation[];
  bottlenecksFound: number;
  redundanciesFound: number;
  duration: number;
}

// ── Impact Estimate (legacy compat) ─────────────────────────────

export interface ImpactEstimate {
  timeSavingPercent: number;
  costReductionPercent: number;
  complexityReduction: number;
  riskLevel: 'low' | 'medium' | 'high';
}
