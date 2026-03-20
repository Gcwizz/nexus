import type { ProcessMap, CanvasState, BPMNElementType } from '@nexus/contracts/processes';

// ── Edit Operations ─────────────────────────────────────────────

export type EditOperationType =
  | 'addElement'
  | 'removeElement'
  | 'modifyElement'
  | 'moveElement'
  | 'addConnection'
  | 'removeConnection'
  | 'reconnectFlow'
  | 'addSwimlane'
  | 'removeSwimlane'
  | 'modifySwimlane';

export interface EditOperation {
  id: string;
  type: EditOperationType;
  timestamp: string;
  userId: string;
  elementId?: string;
  connectionId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export interface Changeset {
  id: string;
  designId: string;
  operations: EditOperation[];
  createdAt: string;
  userId: string;
}

// ── Target Design ───────────────────────────────────────────────

export interface TargetDesignState {
  id: string;
  orgId: string;
  canvasId: string;
  name: string;
  branchName: string | null;
  parentDesignId: string | null;
  canvasState: CanvasState;
  changesets: Changeset[];
  changeCount: number;
  status: 'pending' | 'approved' | 'rejected';
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Impact Analysis ─────────────────────────────────────────────

export type ImpactSeverity = 'high' | 'medium' | 'low';
export type ImpactCategory = 'direct' | 'indirect' | 'cross-department';

export interface ImpactItem {
  elementId: string;
  elementName: string;
  processId: string;
  processName: string;
  category: ImpactCategory;
  severity: ImpactSeverity;
  description: string;
  department?: string;
}

export interface ImpactSummary {
  designId: string;
  totalAffected: number;
  directCount: number;
  indirectCount: number;
  crossDeptCount: number;
  items: ImpactItem[];
  analysedAt: string;
}

// ── Semantic Validation ─────────────────────────────────────────

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  id: string;
  elementId: string;
  elementName?: string;
  severity: ValidationSeverity;
  code: string;
  message: string;
  suggestion?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  validatedAt: string;
}

// ── Branching ───────────────────────────────────────────────────

export interface Branch {
  designId: string;
  branchName: string;
  parentDesignId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BranchDiff {
  sourceBranch: string;
  targetBranch: string;
  added: DiffElement[];
  removed: DiffElement[];
  modified: DiffElement[];
}

// ── Diff ────────────────────────────────────────────────────────

export type DiffCategory = 'added' | 'removed' | 'modified' | 'moved';

export interface DiffElement {
  elementId: string;
  elementName?: string;
  elementType?: string;
  category: DiffCategory;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export interface DiffSummary {
  designId: string;
  addedCount: number;
  removedCount: number;
  modifiedCount: number;
  movedCount: number;
  elements: DiffElement[];
  generatedAt: string;
}

// ── Video Generation ────────────────────────────────────────────

export type VideoJobStatus = 'queued' | 'processing' | 'complete' | 'failed';

export interface VideoJob {
  id: string;
  designId: string;
  orgId: string;
  status: VideoJobStatus;
  narrationScript?: string;
  outputUrl?: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export interface NarrationSegment {
  timestamp: number;
  text: string;
  highlightElements?: string[];
}

export interface VideoManifest {
  designId: string;
  orgId: string;
  title: string;
  narration: NarrationSegment[];
  currentStateSnapshot: string;
  targetStateSnapshot: string;
  diffSummary: DiffSummary;
  generatedAt: string;
}

// ── Approval ────────────────────────────────────────────────────

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface ApprovalRequest {
  designId: string;
  requestedBy: string;
  requestedAt: string;
  reviewers: string[];
  validationResult: ValidationResult;
  status: ApprovalStatus;
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;
}

// ── Collaborative Editing (Yjs) ─────────────────────────────────

export interface CollaboratorCursor {
  userId: string;
  userName: string;
  color: string;
  position: { x: number; y: number };
  selectedElementId?: string;
}

// ── Canvas Element with Diff Overlay ────────────────────────────

export interface CanvasElementWithDiff {
  elementId: string;
  type: string;
  name?: string;
  position: { x: number; y: number };
  size?: { width: number; height: number };
  properties: Record<string, unknown>;
  diffCategory?: DiffCategory;
}

// ── Re-exports from existing types ──────────────────────────────

export type { ProcessMap, CanvasState, BPMNElementType };
