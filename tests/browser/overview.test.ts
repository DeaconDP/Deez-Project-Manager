import assert from "node:assert/strict";
import test from "node:test";
import { verify } from "../harness/verify.ts";

test("overview: metrics soft-fail raises no role=alert and no page error", async (t) => {
  const app = await verify.open(t, { tab: "overview" });
  await app.page.locator("#panel-overview").waitFor();
  await app.page
    .getByRole("tab", { name: "Overview" })
    .and(app.page.locator('[aria-selected="true"]'))
    .waitFor();
  await app.page
    .waitForResponse((res) => {
      try {
        return new URL(res.url()).pathname === "/api/metrics";
      } catch {
        return false;
      }
    }, { timeout: 5000 })
    .catch(() => {});
  assert.deepEqual(await app.page.getByRole("alert").allTextContents(), []);
  assert.deepEqual(
    app.faults().filter((f) => f.startsWith("pageerror:")),
    [],
  );
  await app.shot("overview");
});
