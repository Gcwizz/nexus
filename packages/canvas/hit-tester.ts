import type { CanvasElement, Viewport } from './types';

/**
 * Hit testing: determine which canvas element is under a screen coordinate.
 */
export class HitTester {
  hitTest(
    screenX: number,
    screenY: number,
    elements: CanvasElement[],
    viewport: Viewport
  ): CanvasElement | null {
    const worldX = viewport.x + screenX / viewport.zoom;
    const worldY = viewport.y + screenY / viewport.zoom;

    // Test in reverse order (topmost element first)
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      if (
        worldX >= el.x &&
        worldX <= el.x + el.width &&
        worldY >= el.y &&
        worldY <= el.y + el.height
      ) {
        return el;
      }
    }

    return null;
  }
}
