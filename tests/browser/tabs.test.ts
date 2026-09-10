import assert from "node:assert/strict";
import test from "node:test";
import { verify } from "../harness/verify.ts";

test("tabs: 5 ARIA tabs, aria-selected follows click and ArrowRight", async (t) => {
  const app = await verify.open(t);
  const tabs = app.page.getByRole("tab");
  assert.equal(await tabs.count(), 5);
  assert.equal(
    await app.page.locator("[data-runtime]").getAttribute("data-runtime"),
    "browser",
  );
  assert.equal(
    await app.page.getByRole("tab", { name: "Projects" }).getAttribute(
      "aria-selected",
    ),
    "true",
  );

  await app.openTab("overview");
  assert.equal(
    await app.page.getByRole("tab", { name: "Overview" }).getAttribute(
      "aria-selected",
    ),
    "true",
  );
  await app.page.getByRole("tab", { name: "Overview" }).press("ArrowRight");
  assert.equal(
    await app.page.getByRole("tab", { name: "Processes" }).getAttribute(
      "aria-selected",
    ),
    "true",
  );

  assert.equal(await app.page.getByRole("button", { name: "+ Add project" }).count(), 0);
  assert.equal(await app.page.getByRole("button", { name: /Import/ }).count(), 0);
  assert.equal(await app.page.getByRole("button", { name: /Sync/ }).count(), 0);
  await app.shot("tabs");
});
