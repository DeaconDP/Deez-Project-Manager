import assert from "node:assert/strict";
import test from "node:test";
import {
  moveTaskInBoard,
  parseTrelloBoardJson,
  placeByPriority,
} from "../../src/lib/kanban.ts";
import { createEmptyTask } from "../../src/types.ts";

test("kanban: placeByPriority inserts Crit before High", () => {
  const high = createEmptyTask("p1", {
    id: "high",
    title: "High",
    column: "Doing",
    priority: "High",
    sortIndex: 0,
  });
  const def = createEmptyTask("p1", {
    id: "def",
    title: "Default",
    column: "Doing",
    priority: "Default",
    sortIndex: 1,
  });
  const crit = createEmptyTask("p1", {
    id: "crit",
    title: "Crit",
    column: "Backlog",
    priority: "Crit",
  });
  const next = placeByPriority([high, def], crit, "Doing");
  const doing = next
    .filter((t) => t.column === "Doing")
    .sort((a, b) => a.sortIndex - b.sortIndex)
    .map((t) => t.id);
  assert.deepEqual(doing, ["crit", "high", "def"]);
});

test("kanban: moveTaskInBoard reindexes source and dest", () => {
  const a = createEmptyTask("p1", {
    id: "a",
    title: "A",
    column: "Backlog",
    sortIndex: 0,
  });
  const b = createEmptyTask("p1", {
    id: "b",
    title: "B",
    column: "Backlog",
    sortIndex: 1,
  });
  const next = moveTaskInBoard([a, b], "a", "Doing", 0);
  const moved = next.find((t) => t.id === "a");
  const left = next.find((t) => t.id === "b");
  assert.equal(moved?.column, "Doing");
  assert.equal(moved?.sortIndex, 0);
  assert.equal(left?.column, "Backlog");
  assert.equal(left?.sortIndex, 0);
});

test("kanban: parseTrelloBoardJson maps lists and skips dup cards", () => {
  const existing = [
    createEmptyTask("p1", { title: "Old", trelloCardId: "c-skip" }),
  ];
  const raw = JSON.stringify({
    lists: [
      { id: "l-do", name: "Doing" },
      { id: "l-done", name: "Done" },
    ],
    cards: [
      {
        id: "c-new",
        idList: "l-do",
        name: "Ship it",
        labels: [{ name: "crit" }],
      },
      { id: "c-skip", idList: "l-done", name: "Already imported" },
    ],
  });
  const result = parseTrelloBoardJson(raw, "p1", existing);
  assert.equal(result.added, 1);
  assert.equal(result.skipped, 1);
  const shipped = result.tasks.find((t) => t.trelloCardId === "c-new");
  assert.equal(shipped?.title, "Ship it");
  assert.equal(shipped?.column, "Doing");
  assert.equal(shipped?.priority, "Crit");
});
