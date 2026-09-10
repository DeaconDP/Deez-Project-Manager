import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { REPO_ROOT } from "../harness/evidence.ts";

test("loads: every src/lib/*.ts + src/types.ts imports under node", async () => {
  const libDir = join(REPO_ROOT, "src/lib");
  const files = (await readdir(libDir))
    .filter((name) => name.endsWith(".ts"))
    .map((name) => join(libDir, name));
  files.push(join(REPO_ROOT, "src/types.ts"));

  const loaded: string[] = [];
  for (const file of files) {
    const mod = await import(pathToFileURL(file).href);
    assert.equal(typeof mod, "object");
    assert.notEqual(mod, null);
    loaded.push(relative(REPO_ROOT, file));
  }
  assert.deepEqual(loaded.sort(), [
    "src/lib/gitUpdate.ts",
    "src/lib/kanban.ts",
    "src/lib/mesh.ts",
    "src/lib/runtime.ts",
    "src/types.ts",
  ]);
});
