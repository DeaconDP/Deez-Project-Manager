# Tabs

The shell exposes five primary sections. The selected tab is the only one with `aria-selected="true"`.

## Sub-features

- `tabs-count` shows five tabs in the list named **Sections**.
- `tabs-click` moves `aria-selected` to the chosen tab.
- `tabs-arrow` moves selection with ArrowRight / ArrowLeft.
- `tabs-runtime` stays on `data-runtime="browser"` in Chrome.

## How to get to it (user POV)

- Load the app.
- Choose **Projects**, **Overview**, **Processes**, **Fuel**, or **Settings**.
- With a tab focused, press ArrowRight or ArrowLeft.

## Driving it with verify.open

Preconditions:

- Open an empty or seeded store on the Projects tab.

- **Count.** `getByRole("tab")` count is `5`.
- **Click.** `openTab("overview")`. Overview has `aria-selected="true"`.
- **Keyboard.** Focus Overview and press ArrowRight. Processes becomes selected.
- **Browser chrome.** `data-runtime` is `browser`. **+ Add project**, Import, and Sync are absent.
- **Proof.** Save `tabs.png`.

## Gotchas

- Tab state is not stored. Seed `tab` by clicking after load.
- Arrow keys wrap around the five tabs.
- Desktop Import / Add / Sync buttons are missing on purpose in the browser runtime.
