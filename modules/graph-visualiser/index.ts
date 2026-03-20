/**
 * Graph Visualiser (Module 3)
 *
 * Renders the business ontology as an interactive 3D force-directed graph
 * using Three.js + 3d-force-graph. Provides semantic zoom, filtering,
 * search, entity detail panels, and the "Business in Numbers" executive
 * summary dashboard.
 */

export type * from './types.js';

// -- Services ----------------------------------------------------------------
export { fetchGraphData, fetchEntityDetail, fetchClusters } from './services/graph-data.service.js';
export type { GraphNode, GraphLink, ForceGraphData } from './services/graph-data.service.js';
export { searchEntities } from './services/search.service.js';
export type { SearchResult } from './services/search.service.js';
export { generateSummary } from './services/summary.service.js';

// -- API routes --------------------------------------------------------------
export { graphRoutes } from './api/graph.js';
export { getGraph, searchGraph, getEntityDetail, getSummary, getClusters } from './api/graph.js';

// -- UI components -----------------------------------------------------------
export { ForceGraph3D } from './ui/ForceGraph3D.js';
export { GraphFilters, createDefaultFilters } from './ui/GraphFilters.js';
export type { GraphFilterState } from './ui/GraphFilters.js';
export { EntityDetail } from './ui/EntityDetail.js';
export { SearchBar } from './ui/SearchBar.js';
export { BusinessNumbers } from './ui/BusinessNumbers.js';
export { GraphPage } from './ui/GraphPage.js';
