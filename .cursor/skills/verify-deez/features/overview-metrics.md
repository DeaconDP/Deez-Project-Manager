# Overview metrics

Overview shows live load gauges. In the mesh-only PWA those fetches miss `/api` and must fail quietly.

## Sub-features

- `overview-open` shows the Overview panel.
- `overview-soft-fail` keeps `role="alert"` empty when `/api/metrics` is absent.
- `overview-no-pageerror` records zero `pageerror` events.

## How to get to it (user POV)

- Choose the **Overview** tab.

## Driving it with verify.open

Preconditions:

- Do not set `deez-remote-base`.
- Open with `{ tab: "overview" }`.

- **Panel.** A heading named **Overview** exists.
- **Alerts.** `getByRole("alert")` text list is `[]`.
- **Page errors.** `faults()` has no `pageerror:` entries.
- **Proof.** Save `overview.png`.

## Gotchas

- Same-origin `/api/metrics` 404 is the fallback path. Do not treat that HTTP status as a failed proof.
- Settings and process sub-tabs have their own alerts. Stay on Overview for this recipe.
- Empty gauges (0% / N/A) are success for a hostless PWA, not a missing panel.
