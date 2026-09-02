/**
 * Tiny node smoke test for mesh merge (no test runner).
 * Run: node --experimental-strip-types scripts/test-mesh-merge.mjs
 * or after build: node -e "..." — uses dynamic import of compiled? Prefer inline.
 */
import assert from "node:assert/strict";

// Inline minimal copies so we don't need a TS runner in CI.
function newerIso(a, b) {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) && Number.isNaN(tb)) return false;
  if (Number.isNaN(ta)) return false;
  if (Number.isNaN(tb)) return true;
  return ta >= tb;
}

function mergeById(local, remote) {
  const map = new Map();
  for (const item of remote) map.set(item.id, item);
  for (const item of local) {
    const existing = map.get(item.id);
    if (!existing || newerIso(item.updatedAt, existing.updatedAt)) {
      map.set(item.id, item);
    }
  }
  return [...map.values()];
}

const local = [
  { id: "a", title: "local-a", updatedAt: "2026-01-02T00:00:00.000Z" },
  { id: "b", title: "local-b", updatedAt: "2026-01-01T00:00:00.000Z" },
];
const remote = [
  { id: "b", title: "remote-b", updatedAt: "2026-01-03T00:00:00.000Z" },
  { id: "c", title: "remote-c", updatedAt: "2026-01-01T00:00:00.000Z" },
];
const merged = mergeById(local, remote).sort((x, y) => x.id.localeCompare(y.id));
assert.equal(merged.length, 3);
assert.equal(merged[0].title, "local-a");
assert.equal(merged[1].title, "remote-b");
assert.equal(merged[2].title, "remote-c");
console.log("mesh merge smoke ok");
