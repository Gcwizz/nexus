import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { Awareness } from 'y-protocols/awareness';

// ── Types ─────────────────────────────────────────────────────────

export interface CollaborationUser {
  id: string;
  name: string;
  color: string;
  cursor?: { x: number; y: number };
  selectedElementId?: string | null;
}

export interface CanvasAnnotation {
  id: string;
  processId: string;
  elementId?: string;
  text: string;
  author: string;
  createdAt: string;
  type: 'comment' | 'flag' | 'suggestion';
}

export interface CollaborationConfig {
  wsUrl: string;
  orgId: string;
  canvasId: string;
  userId: string;
  userName: string;
  userColor: string;
}

// ── User Colour Palette ───────────────────────────────────────────

const CURSOR_COLORS = [
  '#e53935', '#8e24aa', '#1e88e5', '#43a047',
  '#fb8c00', '#00acc1', '#d81b60', '#3949ab',
  '#7cb342', '#f4511e', '#6d4c41', '#546e7a',
];

export function assignUserColor(index: number): string {
  return CURSOR_COLORS[index % CURSOR_COLORS.length];
}

// ── Collaboration Service ─────────────────────────────────────────

export class CollaborationService {
  private doc: Y.Doc;
  private provider: WebsocketProvider | null = null;
  private awareness: Awareness | null = null;
  private config: CollaborationConfig;
  private disposed = false;

  /** Shared Yjs types */
  private annotationsMap: Y.Map<CanvasAnnotation>;
  private viewportMap: Y.Map<number>;
  private selectionsMap: Y.Map<string | null>;

  constructor(config: CollaborationConfig) {
    this.config = config;
    this.doc = new Y.Doc();

    // Define shared types on the Yjs document
    this.annotationsMap = this.doc.getMap<CanvasAnnotation>('annotations');
    this.viewportMap = this.doc.getMap<number>('viewport');
    this.selectionsMap = this.doc.getMap<string | null>('selections');
  }

  // ── Connection Management ───────────────────────────────────────

  /**
   * Connect to the WebSocket collaboration server.
   * Room is scoped to org + canvas for isolation.
   */
  connect(): void {
    if (this.disposed) return;

    const roomName = `canvas:${this.config.orgId}:${this.config.canvasId}`;

    this.provider = new WebsocketProvider(
      this.config.wsUrl,
      roomName,
      this.doc,
      { connect: true },
    );

    this.awareness = this.provider.awareness;

    // Set local user state
    this.awareness.setLocalStateField('user', {
      id: this.config.userId,
      name: this.config.userName,
      color: this.config.userColor,
      cursor: null,
      selectedElementId: null,
    } satisfies CollaborationUser);
  }

  disconnect(): void {
    if (this.provider) {
      this.provider.disconnect();
      this.provider.destroy();
      this.provider = null;
    }
    this.awareness = null;
  }

  dispose(): void {
    this.disposed = true;
    this.disconnect();
    this.doc.destroy();
  }

  isConnected(): boolean {
    return this.provider?.wsconnected ?? false;
  }

  // ── Cursor Presence ─────────────────────────────────────────────

  /**
   * Update the local user's cursor position, broadcast to all peers.
   */
  updateCursor(x: number, y: number): void {
    if (!this.awareness) return;
    this.awareness.setLocalStateField('user', {
      ...this.getLocalUser(),
      cursor: { x, y },
    });
  }

  /**
   * Update which element the local user has selected.
   */
  updateSelection(elementId: string | null): void {
    if (!this.awareness) return;
    this.awareness.setLocalStateField('user', {
      ...this.getLocalUser(),
      selectedElementId: elementId,
    });

    // Also store in shared map so selections persist across reconnects
    this.selectionsMap.set(this.config.userId, elementId);
  }

  /**
   * Get all currently connected users (excluding local).
   */
  getRemoteUsers(): CollaborationUser[] {
    if (!this.awareness) return [];

    const users: CollaborationUser[] = [];
    const localClientId = this.awareness.clientID;

    this.awareness.getStates().forEach((state, clientId) => {
      if (clientId !== localClientId && state.user) {
        users.push(state.user as CollaborationUser);
      }
    });

    return users;
  }

  /**
   * Subscribe to awareness changes (cursor moves, user join/leave).
   */
  onAwarenessChange(callback: (users: CollaborationUser[]) => void): () => void {
    if (!this.awareness) return () => {};

    const handler = () => {
      callback(this.getRemoteUsers());
    };

    this.awareness.on('change', handler);
    return () => this.awareness?.off('change', handler);
  }

  // ── Annotations (CRDT-synced) ───────────────────────────────────

  /**
   * Add an annotation to the shared document.
   */
  addAnnotation(annotation: CanvasAnnotation): void {
    this.doc.transact(() => {
      this.annotationsMap.set(annotation.id, annotation);
    });
  }

  /**
   * Remove an annotation by ID.
   */
  removeAnnotation(annotationId: string): void {
    this.doc.transact(() => {
      this.annotationsMap.delete(annotationId);
    });
  }

  /**
   * Get all annotations.
   */
  getAnnotations(): CanvasAnnotation[] {
    const annotations: CanvasAnnotation[] = [];
    this.annotationsMap.forEach((value) => {
      annotations.push(value);
    });
    return annotations;
  }

  /**
   * Get annotations for a specific process or element.
   */
  getAnnotationsForElement(processId: string, elementId?: string): CanvasAnnotation[] {
    return this.getAnnotations().filter((a) => {
      if (a.processId !== processId) return false;
      if (elementId && a.elementId !== elementId) return false;
      return true;
    });
  }

  /**
   * Subscribe to annotation changes.
   */
  onAnnotationsChange(callback: (annotations: CanvasAnnotation[]) => void): () => void {
    const handler = () => {
      callback(this.getAnnotations());
    };

    this.annotationsMap.observe(handler);
    return () => this.annotationsMap.unobserve(handler);
  }

  // ── Shared Viewport (optional sync) ─────────────────────────────

  /**
   * Broadcast viewport state for "follow me" mode.
   */
  broadcastViewport(x: number, y: number, zoom: number): void {
    this.doc.transact(() => {
      this.viewportMap.set(`${this.config.userId}:x`, x);
      this.viewportMap.set(`${this.config.userId}:y`, y);
      this.viewportMap.set(`${this.config.userId}:zoom`, zoom);
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────

  private getLocalUser(): CollaborationUser {
    return {
      id: this.config.userId,
      name: this.config.userName,
      color: this.config.userColor,
      cursor: null,
      selectedElementId: null,
    };
  }

  getDoc(): Y.Doc {
    return this.doc;
  }
}
