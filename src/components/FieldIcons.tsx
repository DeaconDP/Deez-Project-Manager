import type {
  Category,
  GithubStatus,
  Platform,
  Priority,
  Status,
} from "../types";
import { normalizeCategory, normalizeStatus } from "../types";

const svg18 = {
  width: 18,
  height: 18,
  viewBox: "0 0 18 18",
  fill: "none" as const,
  xmlns: "http://www.w3.org/2000/svg",
  "aria-hidden": true as const,
};

export function PlatformIcon({ platform }: { platform: Platform }) {
  const common = { ...svg18, className: "platform-icon" };

  switch (platform) {
    case "Unity":
      return (
        <svg {...common}>
          <path
            d="M9 2.5 14.5 5.5v7L9 15.5 3.5 12.5v-7L9 2.5Z"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
          <path
            d="M9 2.5v13M3.5 5.5 9 8.5l5.5-3"
            stroke="currentColor"
            strokeWidth="1.15"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "Unreal":
      return (
        <svg {...common}>
          <circle
            cx="9"
            cy="9"
            r="6.25"
            stroke="currentColor"
            strokeWidth="1.35"
          />
          <path
            d="M6.2 11.5V6.5h2.1c1.35 0 2.2.7 2.2 1.85 0 .95-.55 1.55-1.4 1.75L11.8 11.5H10l-1.5-1.3H7.55v1.3H6.2Zm1.35-2.45h.75c.55 0 .9-.3.9-.75s-.35-.75-.9-.75h-.75v1.5Z"
            fill="currentColor"
          />
        </svg>
      );
    case "Web":
      return (
        <svg {...common}>
          <circle
            cx="9"
            cy="9"
            r="6.25"
            stroke="currentColor"
            strokeWidth="1.35"
          />
          <path
            d="M2.75 9h12.5M9 2.75c1.8 1.9 2.7 4 2.7 6.25S10.8 13.35 9 15.25M9 2.75C7.2 4.65 6.3 6.75 6.3 9s.9 4.6 2.7 6.25"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "Native":
      return (
        <svg {...common}>
          <rect
            x="5.25"
            y="2.75"
            width="7.5"
            height="12.5"
            rx="1.4"
            stroke="currentColor"
            strokeWidth="1.35"
          />
          <path
            d="M7.5 13.75h3"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
          />
        </svg>
      );
    case "Viverse":
      return (
        <svg {...common}>
          <path
            d="M9 2.75 15.25 9 9 15.25 2.75 9 9 2.75Z"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
          <circle cx="9" cy="9" r="2.1" fill="currentColor" />
        </svg>
      );
    case "Consulting":
      return (
        <svg {...common}>
          <path
            d="M3.5 7.25h11v7.25H3.5V7.25Z"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
          <path
            d="M6.25 7.25V5.5a2.75 2.75 0 0 1 5.5 0v1.75"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinecap="round"
          />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle
            cx="9"
            cy="9"
            r="6.25"
            stroke="currentColor"
            strokeWidth="1.35"
          />
          <circle cx="6.25" cy="9" r="1.1" fill="currentColor" />
          <circle cx="9" cy="9" r="1.1" fill="currentColor" />
          <circle cx="11.75" cy="9" r="1.1" fill="currentColor" />
        </svg>
      );
  }
}

/** Header glyph for the Platform column. */
export function PlatformHeaderIcon() {
  return (
    <svg {...svg18} className="field-header-icon">
      <circle
        cx="9"
        cy="9"
        r="6.25"
        stroke="currentColor"
        strokeWidth="1.35"
      />
      <path
        d="M2.75 9h12.5M9 2.75c1.8 1.9 2.7 4 2.7 6.25S10.8 13.35 9 15.25M9 2.75C7.2 4.65 6.3 6.75 6.3 9s.9 4.6 2.7 6.25"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PriorityIcon({ priority }: { priority: Priority }) {
  const common = { ...svg18, className: "field-icon priority-field-icon" };
  const bars =
    priority === "Crit"
      ? 4
      : priority === "High"
        ? 3
        : priority === "Med"
          ? 2
          : priority === "Low"
            ? 1
            : 0;

  if (bars === 0) {
    return (
      <svg {...common}>
        <circle
          cx="9"
          cy="9"
          r="5.5"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeDasharray="2.5 2"
        />
      </svg>
    );
  }

  const heights = [4, 7, 10, 13];
  return (
    <svg {...common}>
      {heights.slice(0, bars).map((h, i) => (
        <rect
          key={i}
          x={3.5 + i * 3}
          y={15 - h}
          width="2"
          height={h}
          rx="0.75"
          fill="currentColor"
        />
      ))}
    </svg>
  );
}

export function PriorityHeaderIcon() {
  return (
    <svg {...svg18} className="field-header-icon">
      <rect x="3.5" y="11" width="2" height="4" rx="0.75" fill="currentColor" />
      <rect x="6.5" y="8" width="2" height="7" rx="0.75" fill="currentColor" />
      <rect x="9.5" y="5" width="2" height="10" rx="0.75" fill="currentColor" />
      <rect x="12.5" y="2" width="2" height="13" rx="0.75" fill="currentColor" />
    </svg>
  );
}

export function StatusIcon({ status }: { status: Status | string }) {
  const s = normalizeStatus(status);
  const common = { ...svg18, className: "field-icon status-field-icon" };

  switch (s) {
    case "Urgent":
      return (
        <svg {...common}>
          <path
            d="M9 2.5 15 14.5H3L9 2.5Z"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
          <path
            d="M9 7v3.25M9 12.5v.25"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinecap="round"
          />
        </svg>
      );
    case "Experiment":
      return (
        <svg {...common}>
          <path
            d="M7 2.75h4M8 2.75v4.5L4.5 14.5h9L10 7.25V2.75"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M6.25 11.5h5.5"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "To Do":
      return (
        <svg {...common}>
          <circle
            cx="9"
            cy="9"
            r="6"
            stroke="currentColor"
            strokeWidth="1.35"
          />
        </svg>
      );
    case "WIP":
      return (
        <svg {...common}>
          <circle
            cx="9"
            cy="9"
            r="6"
            stroke="currentColor"
            strokeWidth="1.35"
          />
          <path
            d="M7.25 6.25 12 9l-4.75 2.75V6.25Z"
            fill="currentColor"
          />
        </svg>
      );
    case "Testing":
      return (
        <svg {...common}>
          <path
            d="M4 4.5h10v2.5L10.5 12v3H7.5v-3L4 7V4.5Z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "Maintaining":
      return (
        <svg {...common}>
          <path
            d="M11.5 3.5a3.75 3.75 0 0 0-5.3 5.3L3.5 11.5l3 3 2.7-2.7a3.75 3.75 0 0 0 5.3-5.3L12.5 8.5 11.5 7.5 9.5 5.5l2-2Z"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "Done":
      return (
        <svg {...common}>
          <circle
            cx="9"
            cy="9"
            r="6"
            stroke="currentColor"
            strokeWidth="1.35"
          />
          <path
            d="M5.75 9.1 7.9 11.2 12.25 6.6"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "Broken":
      return (
        <svg {...common}>
          <path
            d="M9 2.75 15.25 14.5H2.75L9 2.75Z"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
          <path
            d="M9 7.25v3M9 12.5h.01"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      );
    case "Delete":
      return (
        <svg {...common}>
          <path
            d="M3.5 4.5h11M6.5 4.5V3.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1M5.5 4.5v9a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1v-9"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle
            cx="9"
            cy="9"
            r="6"
            stroke="currentColor"
            strokeWidth="1.35"
          />
        </svg>
      );
  }
}

export function StatusHeaderIcon() {
  return (
    <svg {...svg18} className="field-header-icon">
      <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.35" />
      <path
        d="M5.75 9.1 7.9 11.2 12.25 6.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CategoryIcon({ category }: { category: Category | string }) {
  const c = normalizeCategory(category);
  const common = { ...svg18, className: "field-icon category-field-icon" };

  switch (c) {
    case "VR":
      return (
        <svg {...common}>
          <path
            d="M2.75 6.5h12.5v5.5c0 .8-.65 1.5-1.5 1.5H4.25c-.85 0-1.5-.7-1.5-1.5V6.5Z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <path
            d="M6 6.5V5.25a3 3 0 0 1 6 0V6.5M9 9.5v2"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
          />
        </svg>
      );
    case "AR":
      return (
        <svg {...common}>
          <path
            d="M9 3.25 14.5 6.5v5L9 14.75 3.5 11.5v-5L9 3.25Z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <circle cx="9" cy="9" r="1.75" fill="currentColor" />
        </svg>
      );
    case "Utility":
      return (
        <svg {...common}>
          <path
            d="M11.25 3.75a2.75 2.75 0 0 0-3.9 3.9L4.5 10.5l2.75 2.75 2.85-2.85a2.75 2.75 0 0 0 3.9-3.9L12 8l-1-1-1.75-1.75 2-2Z"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "Web":
      return (
        <svg {...common}>
          <circle
            cx="9"
            cy="9"
            r="6.25"
            stroke="currentColor"
            strokeWidth="1.35"
          />
          <path
            d="M2.75 9h12.5M9 2.75c1.8 1.9 2.7 4 2.7 6.25S10.8 13.35 9 15.25M9 2.75C7.2 4.65 6.3 6.75 6.3 9s.9 4.6 2.7 6.25"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "Game":
      return (
        <svg {...common}>
          <rect
            x="2.75"
            y="5.5"
            width="12.5"
            height="7.5"
            rx="2.5"
            stroke="currentColor"
            strokeWidth="1.3"
          />
          <path
            d="M6 8v3M4.5 9.5h3M11.25 8.75h.01M12.75 10.25h.01"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinecap="round"
          />
        </svg>
      );
    case "Client":
      return (
        <svg {...common}>
          <circle
            cx="9"
            cy="6.5"
            r="2.5"
            stroke="currentColor"
            strokeWidth="1.3"
          />
          <path
            d="M4 14.25c.75-2.5 2.5-3.75 5-3.75s4.25 1.25 5 3.75"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
      );
    case "Bot":
      return (
        <svg {...common}>
          <rect
            x="4"
            y="5.5"
            width="10"
            height="8"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.3"
          />
          <path
            d="M9 3.25v2.25M6.75 9h.01M11.25 9h.01M6.5 11.75h5"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinecap="round"
          />
        </svg>
      );
    case "Backup":
      return (
        <svg {...common}>
          <path
            d="M4.5 5.5h9v8.5h-9V5.5Z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <path
            d="M6.5 5.5V4.25h5V5.5M7 8.5h4M7 11h4"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
          />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle
            cx="9"
            cy="9"
            r="6.25"
            stroke="currentColor"
            strokeWidth="1.35"
          />
          <circle cx="6.25" cy="9" r="1.1" fill="currentColor" />
          <circle cx="9" cy="9" r="1.1" fill="currentColor" />
          <circle cx="11.75" cy="9" r="1.1" fill="currentColor" />
        </svg>
      );
  }
}

export function CategoryHeaderIcon() {
  return (
    <svg {...svg18} className="field-header-icon">
      <path
        d="M3.5 5h11v9H3.5V5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M6 5V3.75h6V5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function GithubStatusIcon({ status }: { status: GithubStatus }) {
  const common = { ...svg18, className: "field-icon github-field-icon" };

  switch (status) {
    case "none":
      return (
        <svg {...common}>
          <path
            d="M4 9h10"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinecap="round"
          />
        </svg>
      );
    case "remote-only":
      return (
        <svg {...common}>
          <circle
            cx="9"
            cy="9"
            r="6"
            stroke="currentColor"
            strokeWidth="1.3"
          />
          <path
            d="M9 5.5v5M6.75 8.25 9 5.75l2.25 2.5"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "clean":
      return (
        <svg {...common}>
          <path
            d="M6.5 3.5c-2.5 1-3.75 3.5-3 6.25C4.25 12.5 6.5 14.5 9 14.5s4.75-2 5.5-4.75c.75-2.75-.5-5.25-3-6.25"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
          <path
            d="M6.5 9.25 8.25 11l3.5-4"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "dirty":
      return (
        <svg {...common}>
          <path
            d="M6.5 3.5c-2.5 1-3.75 3.5-3 6.25C4.25 12.5 6.5 14.5 9 14.5s4.75-2 5.5-4.75c.75-2.75-.5-5.25-3-6.25"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
          <path
            d="M9 7v3.25M9 12.25h.01"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      );
    case "ahead":
      return (
        <svg {...common}>
          <path
            d="M9 13.5V5.5M5.75 8.5 9 5.25 12.25 8.5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "behind":
      return (
        <svg {...common}>
          <path
            d="M9 4.5v8M5.75 9.5 9 12.75 12.25 9.5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "diverged":
      return (
        <svg {...common}>
          <path
            d="M5.5 4.5v9M12.5 4.5v9M5.5 7.5 9 5.25 12.5 7.5M5.5 10.5 9 12.75 12.5 10.5"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "error":
      return (
        <svg {...common}>
          <circle
            cx="9"
            cy="9"
            r="6"
            stroke="currentColor"
            strokeWidth="1.35"
          />
          <path
            d="M9 5.75v4M9 12.25h.01"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}

export function GithubHeaderIcon() {
  return (
    <svg {...svg18} className="field-header-icon">
      <path
        d="M9 2.75c-3.45 0-6.25 2.8-6.25 6.25 0 2.76 1.79 5.1 4.27 5.93.31.06.42-.14.42-.3v-1.05c-1.74.38-2.1-.74-2.1-.74-.28-.72-.7-.91-.7-.91-.57-.39.04-.38.04-.38.63.04.96.65.96.65.56.96 1.47.68 1.83.52.06-.4.22-.68.4-.84-1.39-.16-2.85-.7-2.85-3.1 0-.68.24-1.24.64-1.68-.06-.16-.28-.8.06-1.66 0 0 .52-.17 1.7.64a5.9 5.9 0 0 1 3.1 0c1.18-.81 1.7-.64 1.7-.64.34.86.12 1.5.06 1.66.4.44.64 1 .64 1.68 0 2.41-1.47 2.94-2.87 3.1.23.2.43.58.43 1.17v1.73c0 .17.11.36.43.3A6.26 6.26 0 0 0 15.25 9c0-3.45-2.8-6.25-6.25-6.25Z"
        fill="currentColor"
      />
    </svg>
  );
}
