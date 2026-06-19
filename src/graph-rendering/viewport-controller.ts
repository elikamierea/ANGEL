// MVP viewport state holder

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

export class ViewportController {
  private state: ViewportState = { x: 0, y: 0, zoom: 1 };

  getState(): ViewportState {
    return { ...this.state };
  }

  setState(next: Partial<ViewportState>): void {
    const nextZoom = next.zoom ?? this.state.zoom;
    this.state = {
      ...this.state,
      ...next,
      zoom: Math.min(4, Math.max(0.1, nextZoom)),
    };
  }

  panBy(dx: number, dy: number): void {
    this.state = {
      ...this.state,
      x: this.state.x + dx,
      y: this.state.y + dy,
    };
  }

  zoomBy(delta: number): void {
    this.setState({ zoom: this.state.zoom + delta });
  }
}
