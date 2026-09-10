# Host scope

Host scope lets a user hide pathless rows stamped for another machine, then reveal the full inventory.

## Sub-features

- `scope-empty` shows "No projects on this host." when the filtered list is empty.
- `scope-this` hides other-box stamps and keeps this-host plus localPath rows.
- `scope-all` shows every stamp.
- `scope-stamp` writes this host onto a localPath row and persists it.

## How to get to it (user POV)

- Open the Projects tab.
- Use the **This host** and **All hosts** buttons in the group named **Host inventory**.

## Driving it with verify.open

Preconditions:

- Seed `host: "deez-verify"`.
- Include rows named `Here` (host `deez-verify`), `Pathed` (a real `localPath`), and `Elsewhere` (host `other-box`).

- **Empty filter.** Open with no projects. `emptyState().title` is `No projects on this host.`
- **This host.** `visibleProjectNames()` is `["Here", "Pathed"]`.
- **All hosts.** Click **All hosts**. `visibleProjectNames()` is `["Here", "Pathed", "Elsewhere"]`.
- **Stamp.** Seed only `Pathed` with a path and no host. After load, `storedProjects()` has a non-empty `host`. Reload. The same stamp is still there.
- **Proof.** Save `scope-this.png` and `scope-all.png` under the run evidence dir.

## Gotchas

- `projectOnThisHost` treats any row with `localPath` as on this machine, even if `host` says otherwise.
- `thisHost` is mesh `deviceName` after `useMesh` hydrates. The first paint uses `defaultDeviceName()`, so a path row may keep that first stamp.
- Do not set `deez-remote-base`. The store must fall back to `deez-projects-store`.
