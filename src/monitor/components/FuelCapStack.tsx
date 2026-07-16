import type { FuelSourceView } from "../types/usage";
import { Gauge } from "./Gauge";

type Props = {
  view: FuelSourceView;
  /** When true, render the source title above the stack (Overview). Fuel tab already has an h3. */
  showTitle?: boolean;
};

export function FuelCapStack({ view, showTitle = false }: Props) {
  if (view.caps.length === 0) return null;

  return (
    <div className="fuel-cap-stack" data-source={view.id}>
      {showTitle ? (
        <div className="fuel-cap-stack__head">
          <h4 className="fuel-cap-stack__title">{view.title}</h4>
          {view.status ? (
            <span className="fuel-cap-stack__status">{view.status}</span>
          ) : null}
        </div>
      ) : null}
      <div className="fuel-cap-stack__bars" role="group" aria-label={view.title}>
        {view.caps.map((cap) => (
          <Gauge
            key={cap.id}
            label={cap.label}
            value={cap.percentUsed}
            sub={cap.sub}
            accent={view.accent}
          />
        ))}
      </div>
    </div>
  );
}
