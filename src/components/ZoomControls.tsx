interface Props {
  zoom: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}

export function ZoomControls({
  zoom,
  canZoomIn,
  canZoomOut,
  onZoomIn,
  onZoomOut,
  onReset,
}: Props) {
  return (
    <div className="zoom-controls" role="group" aria-label="UI zoom">
      <button
        type="button"
        className="zoom-btn"
        onClick={onZoomOut}
        disabled={!canZoomOut}
        aria-label="Zoom out"
        title="Zoom out (Ctrl+-)"
      >
        −
      </button>
      <button
        type="button"
        className="zoom-label"
        onClick={onReset}
        aria-label={`UI zoom ${zoom} percent. Reset to 100 percent`}
        title="Reset zoom (Ctrl+0)"
      >
        {zoom}%
      </button>
      <button
        type="button"
        className="zoom-btn"
        onClick={onZoomIn}
        disabled={!canZoomIn}
        aria-label="Zoom in"
        title="Zoom in (Ctrl+=)"
      >
        +
      </button>
    </div>
  );
}
