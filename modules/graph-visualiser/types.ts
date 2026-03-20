/** Supported graph layout algorithms. */
export type LayoutAlgorithm = "force-directed" | "hierarchical" | "radial" | "dagre" | "grid";

/** Configuration for a graph visualisation viewport. */
export interface ViewportConfig {
  width: number;
  height: number;
  zoom: number;
  panX: number;
  panY: number;
  minZoom: number;
  maxZoom: number;
}

/** Visual style applied to a rendered graph node. */
export interface NodeStyle {
  nodeId: string;
  color: string;
  radius: number;
  label?: string;
  icon?: string;
  opacity?: number;
}

/** Visual style applied to a rendered graph edge. */
export interface EdgeStyle {
  edgeId: string;
  color: string;
  width: number;
  dashed?: boolean;
  label?: string;
}

/** A cluster of related nodes for grouped display. */
export interface NodeCluster {
  id: string;
  name: string;
  nodeIds: string[];
  color: string;
  collapsed: boolean;
}

/** Options for rendering a graph to the canvas. */
export interface RenderOptions {
  layout: LayoutAlgorithm;
  viewport: ViewportConfig;
  nodeStyles?: NodeStyle[];
  edgeStyles?: EdgeStyle[];
  clusters?: NodeCluster[];
  animateTransitions?: boolean;
}
