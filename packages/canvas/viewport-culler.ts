import type { CanvasElement, Viewport } from './types';

/**
 * Viewport culling: only process elements visible in the current viewport.
 * Elements within the viewport + buffer zone are included.
 */
export class ViewportCuller {
  private bufferScreens: number;

  constructor(bufferScreens = 1) {
    this.bufferScreens = bufferScreens;
  }

  cull(elements: CanvasElement[], viewport: Viewport): CanvasElement[] {
    const bufferX = viewport.width * this.bufferScreens / viewport.zoom;
    const bufferY = viewport.height * this.bufferScreens / viewport.zoom;

    const left = viewport.x - bufferX;
    const right = viewport.x + viewport.width / viewport.zoom + bufferX;
    const top = viewport.y - bufferY;
    const bottom = viewport.y + viewport.height / viewport.zoom + bufferY;

    return elements.filter((el) => {
      const elRight = el.x + el.width;
      const elBottom = el.y + el.height;
      return elRight >= left && el.x <= right && elBottom >= top && el.y <= bottom;
    });
  }
}
