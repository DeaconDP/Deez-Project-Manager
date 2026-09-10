import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeStores,
  parseMeshDocument,
  toMeshDocument,
  type MeshPeer,
} from "../../src/lib/mesh.ts";
import { createEmptyProject, type ProjectStore } from "../../src/types.ts";

function store(projects: ReturnType<typeof createEmptyProject>[]): ProjectStore {
  return { version: 1, projects, syncRoots: [], tasks: [] };
}

test("mesh: local newer wins; remote-only rows survive", () => {
  const localA = createEmptyProject({
    id: "a",
    name: "local-a",
    updatedAt: "2026-01-02T00:00:00.000Z",
  });
  const localB = createEmptyProject({
    id: "b",
    name: "local-b",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  const remoteB = createEmptyProject({
    id: "b",
    name: "remote-b",
    updatedAt: "2026-01-03T00:00:00.000Z",
  });
  const remoteC = createEmptyProject({
    id: "c",
    name: "remote-c",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });

  const merged = mergeStores(store([localA, localB]), {
    version: 1,
    updatedAt: "2026-01-03T00:00:00.000Z",
    projects: [remoteB, remoteC],
    tasks: [],
    peers: [],
  });
  const byId = Object.fromEntries(merged.projects.map((p) => [p.id, p.name]));
  assert.deepEqual(byId, { a: "local-a", b: "remote-b", c: "remote-c" });
});

test("mesh: toMeshDocument strips localPath/stickyPort/launchCmd", () => {
  const self: MeshPeer = {
    id: "dev-1",
    name: "deez-verify",
    platform: "linux",
    lastSeenAt: "2026-01-01T00:00:00.000Z",
  };
  const row = createEmptyProject({
    id: "p1",
    name: "Pathed",
    localPath: "/tmp/deez-fixture",
    stickyPort: 3000,
    launchCmd: "npm start",
    githubUrl: "https://github.com/ex/repo",
    githubRepo: "ex/repo",
  });
  const doc = toMeshDocument(store([row]), [], self);
  assert.equal(doc.projects[0]?.localPath, null);
  assert.equal(doc.projects[0]?.stickyPort, null);
  assert.equal(doc.projects[0]?.launchCmd, null);
  assert.equal(doc.projects[0]?.githubStatus, "remote-only");
  assert.deepEqual(
    doc.peers.map((p) => p.id),
    ["dev-1"],
  );
});

test("mesh: parseMeshDocument tolerates junk", () => {
  assert.equal(parseMeshDocument(""), null);
  assert.equal(parseMeshDocument("   "), null);
  const junk = parseMeshDocument('{"foo":1,"projects":"nope"}');
  assert.ok(junk);
  assert.equal(junk.version, 1);
  assert.deepEqual(junk.projects, []);
  assert.deepEqual(junk.tasks, []);
  assert.deepEqual(junk.peers, []);
});
