import type { SpecBundle, SpecModule } from '@nexus/contracts/specs';

// ── Agent Status ─────────────────────────────────────────────────

export type AgentStatus = 'queued' | 'running' | 'complete' | 'failed' | 'blocked';

export interface AgentState {
  id: string;
  buildId: string;
  moduleId: string;
  moduleName: string;
  status: AgentStatus;
  currentTask: string;
  filesGenerated: string[];
  testsTotal: number;
  testsPassing: number;
  testsFailing: number;
  tokenUsage: AgentTokenUsage;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface AgentTokenUsage {
  inputTokens: number;
  outputTokens: number;
  budgetLimit: number;
  thresholdAlerted: boolean;
}

// ── Build Plan ───────────────────────────────────────────────────

export interface BuildPlan {
  buildId: string;
  orgId: string;
  specBundleId: string;
  dag: DAGNode[];
  agents: AgentState[];
  tokenBudget: number;
  tokenUsed: number;
  createdAt: Date;
}

export interface DAGNode {
  moduleId: string;
  dependencies: string[];
  dependents: string[];
  depth: number;
}

// ── Build Progress ───────────────────────────────────────────────

export type BuildPhase = 'planning' | 'scaffolding' | 'generating' | 'testing' | 'reviewing' | 'pipeline' | 'complete' | 'failed';

export interface BuildProgress {
  buildId: string;
  orgId: string;
  phase: BuildPhase;
  modulesTotal: number;
  modulesComplete: number;
  modulesFailed: number;
  agents: AgentState[];
  tokenBudget: number;
  tokenUsed: number;
  qualityGate?: QualityGateResult;
  repoUrl?: string;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

// ── Code Generation ──────────────────────────────────────────────

export type CodegenTarget = 'backend-api' | 'backend-service' | 'backend-data' | 'frontend-page' | 'frontend-component' | 'test' | 'migration';

export interface GeneratedFile {
  path: string;
  content: string;
  target: CodegenTarget;
  moduleId: string;
}

export interface CodegenResult {
  moduleId: string;
  files: GeneratedFile[];
  tokenUsage: { inputTokens: number; outputTokens: number };
}

// ── Architecture ─────────────────────────────────────────────────

export interface ProjectArchitecture {
  name: string;
  structure: DirectoryEntry[];
  packageJson: Record<string, unknown>;
  tsconfig: Record<string, unknown>;
  sharedLibraries: SharedLibrary[];
  dbSchema: string;
}

export interface DirectoryEntry {
  path: string;
  type: 'file' | 'directory';
  content?: string;
}

export interface SharedLibrary {
  name: string;
  type: 'auth' | 'rbac' | 'audit' | 'notifications' | 'file-handling';
  files: GeneratedFile[];
}

// ── Quality Gate ─────────────────────────────────────────────────

export interface QualityGateResult {
  buildId: string;
  passed: boolean;
  testResults: TestResults;
  typeCheckResult: TypeCheckResult;
  securityScanResult: SecurityScanResult;
  complexityResult: ComplexityResult;
  coverageEstimate: number;
  checkedAt: Date;
}

export interface TestResults {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  failures: TestFailure[];
}

export interface TestFailure {
  testName: string;
  file: string;
  error: string;
}

export interface TypeCheckResult {
  passed: boolean;
  errorCount: number;
  errors: TypeCheckError[];
}

export interface TypeCheckError {
  file: string;
  line: number;
  message: string;
}

export interface SecurityScanResult {
  passed: boolean;
  findings: SecurityFinding[];
}

export interface SecurityFinding {
  severity: 'critical' | 'high' | 'medium' | 'low';
  rule: string;
  file: string;
  line: number;
  description: string;
}

export interface ComplexityResult {
  averageComplexity: number;
  maxComplexity: number;
  highComplexityFiles: Array<{ file: string; complexity: number }>;
}

// ── Review ───────────────────────────────────────────────────────

export type ReviewStatus = 'pending' | 'approved' | 'changes_requested' | 'rejected';

export interface ReviewRequest {
  id: string;
  buildId: string;
  moduleId: string;
  moduleName: string;
  status: ReviewStatus;
  files: GeneratedFile[];
  comments: ReviewComment[];
  reviewer?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReviewComment {
  id: string;
  file: string;
  line?: number;
  content: string;
  author: string;
  createdAt: Date;
}

export interface ReviewSubmission {
  status: 'approved' | 'changes_requested' | 'rejected';
  comments: Array<{ file: string; line?: number; content: string }>;
  reviewer: string;
}

// ── Pipeline ─────────────────────────────────────────────────────

export interface PipelineArtifacts {
  githubActionsWorkflow: string;
  dockerfile: string;
  dockerCompose: string;
  terraform: string;
}

// ── Build Logs ───────────────────────────────────────────────────

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface BuildLogEntry {
  timestamp: Date;
  level: LogLevel;
  agentId?: string;
  moduleId?: string;
  message: string;
  details?: Record<string, unknown>;
}

// ── Worker Job Data ──────────────────────────────────────────────

export interface OrchestrateJobData {
  buildId: string;
  orgId: string;
  specBundle: SpecBundle;
}

export interface AgentJobData {
  buildId: string;
  orgId: string;
  agentId: string;
  specModule: SpecModule;
  architecture: ProjectArchitecture;
  tokenBudget: number;
}
