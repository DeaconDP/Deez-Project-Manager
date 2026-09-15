import type { GitActionKind, GitGlanceGlyph, GitGlanceSpec } from "../lib/gitGlance";

const svgProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 18 18",
  fill: "none",
  "aria-hidden": true as const,
};

function GlanceGlyph({ glyph }: { glyph: GitGlanceGlyph }) {
  switch (glyph) {
    case "check":
      return (
        <svg {...svgProps}>
          <path
            d="M4.5 9.25 7.5 12.25 13.5 5.75"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "arrow-up":
      return (
        <svg {...svgProps}>
          <path
            d="M9 13.5V5.5M5.75 8.5 9 5.25 12.25 8.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "arrow-down":
      return (
        <svg {...svgProps}>
          <path
            d="M9 4.5v8M5.75 9.5 9 12.75 12.25 9.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "arrows-diverge":
      return (
        <svg {...svgProps}>
          <path
            d="M5.5 4.5v9M12.5 4.5v9M5.5 7.5 9 5.25 12.5 7.5M5.5 10.5 9 12.75 12.5 10.5"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "cloud":
      return (
        <svg {...svgProps}>
          <path
            d="M5.5 12.25h7.25a2.75 2.75 0 0 0 .35-5.48 3.75 3.75 0 0 0-7.2.9A2.5 2.5 0 0 0 5.5 12.25Z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "warning":
      return (
        <svg {...svgProps}>
          <path
            d="M9 3.5 15.25 14.25H2.75L9 3.5Z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <path
            d="M9 7.5v3M9 12.25h.01"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}

export function GitGlanceControl({
  spec,
  busy,
  onAction,
}: {
  spec: GitGlanceSpec;
  busy: boolean;
  onAction?: (kind: GitActionKind) => void;
}) {
  const className = `git-glance tone-${spec.tone}`;
  const glyph = <GlanceGlyph glyph={spec.glyph} />;

  const actionKind = spec.actionKind;
  if (actionKind == null) {
    return (
      <span className={className} title={spec.a11yLabel} aria-label={spec.a11yLabel}>
        {glyph}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={className}
      title={spec.a11yLabel}
      aria-label={spec.a11yLabel}
      disabled={busy}
      aria-busy={busy || undefined}
      onClick={() => onAction?.(actionKind)}
    >
      {glyph}
    </button>
  );
}
