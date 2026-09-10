import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { REPO_ROOT } from "../harness/evidence.ts";

test("phone-chrome: safe-area insets present in App.css", () => {
  const css = readFileSync(join(REPO_ROOT, "src/App.css"), "utf8");
  assert.match(css, /safe-area-inset-top/);
  assert.match(css, /safe-area-inset-bottom/);
});
