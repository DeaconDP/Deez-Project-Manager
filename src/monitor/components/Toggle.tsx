type Props = {
  id: string;
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  busy?: boolean;
  description?: string;
};

export function Toggle({
  id,
  label,
  checked,
  onChange,
  disabled = false,
  busy = false,
  description,
}: Props) {
  return (
    <div className="toggle">
      <button
        id={id}
        type="button"
        role="switch"
        className={checked ? "toggle__switch is-on" : "toggle__switch"}
        aria-checked={checked}
        aria-busy={busy || undefined}
        aria-describedby={description ? `${id}-desc` : undefined}
        disabled={disabled || busy}
        onClick={() => onChange(!checked)}
      >
        <span className="toggle__thumb" aria-hidden="true" />
      </button>
      <div className="toggle__copy">
        <label className="toggle__label" htmlFor={id}>
          {label}
        </label>
        {description ? (
          <p id={`${id}-desc`} className="toggle__desc">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
