export interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
}

export interface CanvasElement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: string;
  label?: string;
  data?: Record<string, unknown>;
  style?: {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    opacity?: number;
  };
}

export interface CanvasEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  label?: string;
  waypoints?: Array<{ x: number; y: number }>;
  style?: {
    stroke?: string;
    strokeWidth?: number;
    dashArray?: string;
  };
}

export interface RenderOptions {
  viewport: Viewport;
  bufferScreens: number;
  semanticZoomThresholds: {
    aggregated: number;
    normal: number;
    detailed: number;
  };
}
