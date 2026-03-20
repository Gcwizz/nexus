/**
 * Shared WebGL rendering primitives for Modules 3, 4, and 6.
 *
 * Module 3: 3D force-directed graph (Three.js + 3d-force-graph)
 * Module 4: 2D infinite canvas with BPMN rendering
 * Module 6: 2D infinite canvas with editing capabilities
 *
 * This package provides:
 *   - Camera controls (pan, zoom, rotate for 3D / pan, zoom for 2D)
 *   - Viewport culling (only render visible elements)
 *   - Node/edge rendering primitives
 *   - Hit testing (click detection on canvas elements)
 *   - Semantic zoom (LOD switching at different zoom levels)
 */

export { InfiniteCanvas } from './infinite-canvas';
export { ViewportCuller } from './viewport-culler';
export { HitTester } from './hit-tester';
export type { CanvasElement, CanvasEdge, Viewport, RenderOptions } from './types';
