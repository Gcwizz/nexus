import type { CanvasElement, CanvasEdge, Viewport, RenderOptions } from './types';
import { ViewportCuller } from './viewport-culler';
import { HitTester } from './hit-tester';

/**
 * Core infinite canvas engine for Modules 4 and 6.
 *
 * Manages:
 *   - Pan/zoom with smooth interpolation
 *   - Viewport culling (delegate to WebGL renderer)
 *   - Semantic zoom (LOD switching)
 *   - Element/edge management
 *   - Hit testing for click/hover interactions
 *
 * Rendering is delegated to a platform-specific renderer
 * (WebGL via Three.js or PixiJS). This class manages state only.
 */
export class InfiniteCanvas {
  private elements: Map<string, CanvasElement> = new Map();
  private edges: Map<string, CanvasEdge> = new Map();
  private viewport: Viewport;
  private culler: ViewportCuller;
  private hitTester: HitTester;
  private options: RenderOptions;

  constructor(containerWidth: number, containerHeight: number, options?: Partial<RenderOptions>) {
    this.viewport = {
      x: 0,
      y: 0,
      width: containerWidth,
      height: containerHeight,
      zoom: 1,
    };
    this.options = {
      viewport: this.viewport,
      bufferScreens: options?.bufferScreens ?? 1,
      semanticZoomThresholds: options?.semanticZoomThresholds ?? {
        aggregated: 0.2,
        normal: 0.5,
        detailed: 1.5,
      },
    };
    this.culler = new ViewportCuller(this.options.bufferScreens);
    this.hitTester = new HitTester();
  }

  // ── Element management ───────────────────────────────────────

  addElement(element: CanvasElement): void {
    this.elements.set(element.id, element);
  }

  removeElement(id: string): void {
    this.elements.delete(id);
  }

  updateElement(id: string, updates: Partial<CanvasElement>): void {
    const existing = this.elements.get(id);
    if (existing) {
      this.elements.set(id, { ...existing, ...updates });
    }
  }

  addEdge(edge: CanvasEdge): void {
    this.edges.set(edge.id, edge);
  }

  removeEdge(id: string): void {
    this.edges.delete(id);
  }

  // ── Viewport control ─────────────────────────────────────────

  pan(dx: number, dy: number): void {
    this.viewport.x += dx / this.viewport.zoom;
    this.viewport.y += dy / this.viewport.zoom;
  }

  zoom(factor: number, centerX: number, centerY: number): void {
    const oldZoom = this.viewport.zoom;
    const newZoom = Math.max(0.05, Math.min(10, oldZoom * factor));

    // Zoom toward cursor position
    this.viewport.x += (centerX / oldZoom) - (centerX / newZoom);
    this.viewport.y += (centerY / oldZoom) - (centerY / newZoom);
    this.viewport.zoom = newZoom;
  }

  setViewport(viewport: Partial<Viewport>): void {
    Object.assign(this.viewport, viewport);
  }

  getViewport(): Viewport {
    return { ...this.viewport };
  }

  // ── Semantic zoom level ──────────────────────────────────────

  getZoomLevel(): 'aggregated' | 'normal' | 'detailed' {
    const { zoom } = this.viewport;
    const thresholds = this.options.semanticZoomThresholds;
    if (zoom < thresholds.aggregated) return 'aggregated';
    if (zoom < thresholds.detailed) return 'normal';
    return 'detailed';
  }

  // ── Visible elements (culled) ────────────────────────────────

  getVisibleElements(): CanvasElement[] {
    return this.culler.cull(Array.from(this.elements.values()), this.viewport);
  }

  getAllElements(): CanvasElement[] {
    return Array.from(this.elements.values());
  }

  getAllEdges(): CanvasEdge[] {
    return Array.from(this.edges.values());
  }

  // ── Hit testing ──────────────────────────────────────────────

  hitTest(screenX: number, screenY: number): CanvasElement | null {
    const visible = this.getVisibleElements();
    return this.hitTester.hitTest(screenX, screenY, visible, this.viewport);
  }

  // ── Fit to content ───────────────────────────────────────────

  fitToContent(padding = 50): void {
    const elements = Array.from(this.elements.values());
    if (elements.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of elements) {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + el.width);
      maxY = Math.max(maxY, el.y + el.height);
    }

    const contentWidth = maxX - minX + padding * 2;
    const contentHeight = maxY - minY + padding * 2;

    this.viewport.zoom = Math.min(
      this.viewport.width / contentWidth,
      this.viewport.height / contentHeight
    );
    this.viewport.x = minX - padding;
    this.viewport.y = minY - padding;
  }
}
