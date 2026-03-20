import { InfiniteCanvas, type CanvasElement, type CanvasEdge } from '@nexus/canvas';
import type { ProcessMap, CanvasState } from '@nexus/contracts/processes';
import { layoutProcessMap, type BPMNLayout } from './bpmn.service';

// ── Semantic Zoom Thresholds ──────────────────────────────────────

export const ZOOM_THRESHOLDS = {
  /** Zoom < 0.3: Show Level 0-1 (value chain + process groups) */
  VALUE_CHAIN: 0.3,
  /** Zoom 0.3 - 1.0: Show Level 2-3 (processes + activities) */
  PROCESS_DETAIL: 1.0,
  /** Zoom > 1.0: Show Level 4 (individual tasks) */
  TASK_DETAIL: 1.0,
} as const;

export type SemanticZoomLevel = 'value-chain' | 'process-detail' | 'task-detail';

// ── Handoff Highlight Colours ─────────────────────────────────────

const HANDOFF_COLORS: Record<string, string> = {
  default: '#e65100',
  urgent: '#d32f2f',
  standard: '#ef6c00',
  automated: '#1565c0',
};

// ── Canvas Service ────────────────────────────────────────────────

export class CanvasService {
  private canvas: InfiniteCanvas;
  private processes: Map<string, ProcessMap> = new Map();
  private layouts: Map<string, BPMNLayout> = new Map();
  private currentLevel: SemanticZoomLevel = 'process-detail';
  private orgId: string;
  private canvasId: string;
  private annotations: CanvasState['annotations'] = [];

  constructor(orgId: string, canvasId: string, containerWidth: number, containerHeight: number) {
    this.orgId = orgId;
    this.canvasId = canvasId;
    this.canvas = new InfiniteCanvas(containerWidth, containerHeight, {
      semanticZoomThresholds: {
        aggregated: ZOOM_THRESHOLDS.VALUE_CHAIN,
        normal: ZOOM_THRESHOLDS.PROCESS_DETAIL,
        detailed: ZOOM_THRESHOLDS.TASK_DETAIL,
      },
    });
  }

  // ── Process Management ──────────────────────────────────────────

  /**
   * Load all process maps and compute their layouts.
   */
  loadProcesses(processes: ProcessMap[]): void {
    this.processes.clear();
    this.layouts.clear();

    for (const process of processes) {
      this.processes.set(process.id, process);
      const layout = layoutProcessMap(process);
      this.layouts.set(process.id, layout);
    }

    this.syncCanvasElements();
  }

  /**
   * Get processes visible at the current semantic zoom level.
   */
  getVisibleProcesses(): ProcessMap[] {
    const level = this.getSemanticZoomLevel();
    const all = Array.from(this.processes.values());

    switch (level) {
      case 'value-chain':
        return all.filter((p) => p.level <= 1);
      case 'process-detail':
        return all.filter((p) => p.level >= 2 && p.level <= 3);
      case 'task-detail':
        return all.filter((p) => p.level === 4);
    }
  }

  /**
   * Sync canvas elements based on current semantic zoom level.
   * Only add elements for visible process levels.
   */
  syncCanvasElements(): void {
    // Clear existing
    for (const el of this.canvas.getAllElements()) {
      this.canvas.removeElement(el.id);
    }
    for (const edge of this.canvas.getAllEdges()) {
      this.canvas.removeEdge(edge.id);
    }

    const visibleProcesses = this.getVisibleProcesses();

    // Layout offset for stacking multiple process maps
    let yOffset = 0;

    for (const process of visibleProcesses) {
      const layout = this.layouts.get(process.id);
      if (!layout) continue;

      // Add swimlanes as background elements
      for (const lane of layout.swimlanes) {
        this.canvas.addElement({
          id: `${process.id}-${lane.id}`,
          x: lane.x,
          y: lane.y + yOffset,
          width: lane.width,
          height: lane.height,
          type: 'swimlane',
          label: lane.name,
          style: { fill: lane.fill, stroke: '#cccccc', strokeWidth: 1 },
        });
      }

      // Add BPMN elements
      for (const el of layout.elements) {
        this.canvas.addElement({
          id: `${process.id}-${el.id}`,
          x: el.x,
          y: el.y + yOffset,
          width: el.width,
          height: el.height,
          type: el.type,
          label: el.name,
          data: {
            processId: process.id,
            elementId: el.id,
            shape: el.shape,
            bpmnType: el.type,
            departmentLane: el.departmentLane,
          },
          style: {
            fill: el.fill,
            stroke: el.stroke,
            strokeWidth: el.strokeWidth,
          },
        });
      }

      // Add connections as edges
      for (const conn of layout.connections) {
        this.canvas.addEdge({
          id: `${process.id}-${conn.id}`,
          sourceId: `${process.id}-${conn.sourceId}`,
          targetId: `${process.id}-${conn.targetId}`,
          type: conn.type,
          label: conn.label,
          waypoints: conn.waypoints.map((wp) => ({ x: wp.x, y: wp.y + yOffset })),
          style: {
            stroke: conn.stroke,
            strokeWidth: conn.strokeWidth,
            dashArray: conn.dashArray,
          },
        });
      }

      // Offset next process map below this one
      yOffset += layout.bounds.maxY - layout.bounds.minY + 80;
    }
  }

  // ── Semantic Zoom ───────────────────────────────────────────────

  getSemanticZoomLevel(): SemanticZoomLevel {
    const zoom = this.canvas.getViewport().zoom;
    if (zoom < ZOOM_THRESHOLDS.VALUE_CHAIN) return 'value-chain';
    if (zoom < ZOOM_THRESHOLDS.TASK_DETAIL) return 'process-detail';
    return 'task-detail';
  }

  /**
   * Handle zoom changes — switch visible process levels when crossing thresholds.
   */
  onZoomChanged(): void {
    const newLevel = this.getSemanticZoomLevel();
    if (newLevel !== this.currentLevel) {
      this.currentLevel = newLevel;
      this.syncCanvasElements();
    }
  }

  // ── Viewport Controls ──────────────────────────────────────────

  pan(dx: number, dy: number): void {
    this.canvas.pan(dx, dy);
  }

  zoom(factor: number, centerX: number, centerY: number): void {
    this.canvas.zoom(factor, centerX, centerY);
    this.onZoomChanged();
  }

  fitToContent(): void {
    this.canvas.fitToContent();
    this.onZoomChanged();
  }

  getViewport() {
    return this.canvas.getViewport();
  }

  // ── Hit Testing ─────────────────────────────────────────────────

  hitTest(screenX: number, screenY: number): CanvasElement | null {
    return this.canvas.hitTest(screenX, screenY);
  }

  // ── Visible Elements (culled) ──────────────────────────────────

  getVisibleElements(): CanvasElement[] {
    return this.canvas.getVisibleElements();
  }

  getVisibleEdges(): CanvasEdge[] {
    // Return all edges — fine-grained edge culling would need waypoint bounds checks
    return this.canvas.getAllEdges();
  }

  // ── Cross-Department Handoff Highlighting ──────────────────────

  /**
   * Get all cross-department handoff edges with highlight styling.
   */
  getHandoffEdges(): CanvasEdge[] {
    return this.canvas.getAllEdges().filter((edge) => {
      const sourceEl = this.canvas.getVisibleElements().find((el) => el.id === edge.sourceId);
      const targetEl = this.canvas.getVisibleElements().find((el) => el.id === edge.targetId);
      if (!sourceEl || !targetEl) return false;

      const sourceDept = sourceEl.data?.departmentLane as string | undefined;
      const targetDept = targetEl.data?.departmentLane as string | undefined;
      return sourceDept && targetDept && sourceDept !== targetDept;
    });
  }

  // ── Annotation Management ──────────────────────────────────────

  addAnnotation(annotation: CanvasState['annotations'][number]): void {
    this.annotations.push(annotation);
  }

  getAnnotations(processId?: string, elementId?: string): CanvasState['annotations'] {
    return this.annotations.filter((a) => {
      if (processId && a.processId !== processId) return false;
      if (elementId && a.elementId !== elementId) return false;
      return true;
    });
  }

  // ── State Export ────────────────────────────────────────────────

  getCanvasState(): CanvasState {
    return {
      orgId: this.orgId,
      canvasId: this.canvasId,
      viewport: this.canvas.getViewport(),
      processes: Array.from(this.processes.values()),
      annotations: this.annotations,
    };
  }

  getProcess(processId: string): ProcessMap | undefined {
    return this.processes.get(processId);
  }

  getAllProcesses(): ProcessMap[] {
    return Array.from(this.processes.values());
  }

  // ── Underlying Canvas Access ───────────────────────────────────

  getInfiniteCanvas(): InfiniteCanvas {
    return this.canvas;
  }
}
