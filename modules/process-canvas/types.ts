/** A step (node) in a process model. */
export interface ProcessStep {
  id: string;
  name: string;
  kind: ProcessStepKind;
  description?: string;
  swimlaneId?: string;
  position: { x: number; y: number };
  metadata?: Record<string, unknown>;
}

/** Classification of process step types. */
export type ProcessStepKind = "start" | "end" | "task" | "decision" | "subprocess" | "event" | "gateway";

/** A transition (edge) between process steps. */
export interface ProcessTransition {
  id: string;
  sourceStepId: string;
  targetStepId: string;
  condition?: string;
  label?: string;
}

/** A swimlane grouping for process steps. */
export interface Swimlane {
  id: string;
  name: string;
  role: string;
  color: string;
  order: number;
}

/** A complete process model. */
export interface ProcessModel {
  id: string;
  name: string;
  version: number;
  steps: ProcessStep[];
  transitions: ProcessTransition[];
  swimlanes: Swimlane[];
  createdAt: Date;
  updatedAt: Date;
}

/** Options for running a process simulation. */
export interface SimulationOptions {
  processId: string;
  iterations: number;
  timeScaleFactor?: number;
  seedData?: Record<string, unknown>;
}

/** Result of a single simulation run. */
export interface SimulationResult {
  processId: string;
  totalDuration: number;
  bottlenecks: string[];
  pathsTaken: string[][];
  completionRate: number;
}
