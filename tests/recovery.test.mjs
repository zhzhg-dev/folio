import test from "node:test";
import assert from "node:assert/strict";
import { buildBackupBlob } from "../lib/folio/backup.ts";
import { readSavedProjects } from "../lib/folio/recovery-storage.ts";
import { prepareBackup } from "../lib/folio/backup-export.ts";
import { makeProject } from "../lib/folio/model.ts";
import { hashBytes, restoreBackup } from "../lib/folio/files.ts";

test("recovery backup preserves binary originals across base64 chunk boundaries and remains restorable", async () => {
  const project = makeProject("Recovery 中文", "en");
  const bytes = Uint8Array.from(
    { length: 196608 * 2 + 7 },
    (_, index) => index % 251,
  );
  project.sources = [
    {
      id: "source",
      name: "original.pdf",
      kind: "pdf",
      color: "clay",
      versions: [
        {
          id: "v1",
          text: "Evidence",
          pages: [{ page: 1, text: "Evidence" }],
          createdAt: project.createdAt,
          hash: await hashBytes(bytes.buffer),
          size: bytes.length,
          original: new Blob([bytes]),
        },
      ],
    },
  ];
  project.research = {
    question: "unfinished",
    selectedSourceIds: ["source"],
    mode: "passages",
    turns: [],
  };
  project.reading = {
    sourceId: "source",
    versionId: "v1",
    page: 1,
    quote: "Evidence",
  };
  const before = structuredClone(project);
  const progress = [];
  const blob = await buildBackupBlob(project, {
    onProgress: (done, total) => progress.push([done, total]),
  });
  const restored = await restoreBackup(new File([blob], "recovery.folio.json"));
  assert.deepEqual(
    new Uint8Array(
      await restored.sources[0].versions[0].original.arrayBuffer(),
    ),
    bytes,
  );
  assert.deepEqual(restored.research, project.research);
  assert.deepEqual(restored.reading, project.reading);
  assert.equal(progress.length, 3);
  assert.deepEqual(progress.at(-1), [bytes.length, bytes.length]);
  assert.deepEqual(project, before);
});
test("canceling recovery export between chunks stops further original-file reads", async () => {
  const project = makeProject("Cancel", "en");
  const controller = new AbortController();
  let reads = 0;
  const original = new Blob([new Uint8Array(600_000)]);
  const slice = original.slice.bind(original);
  original.slice = (...args) => {
    reads++;
    return slice(...args);
  };
  project.sources = [
    {
      id: "s",
      name: "s",
      kind: "txt",
      color: "green",
      versions: [
        { id: "v", text: "text", pages: [{ page: 1, text: "text" }], original },
      ],
    },
  ];
  await assert.rejects(
    buildBackupBlob(project, {
      signal: controller.signal,
      onProgress: () => controller.abort(),
    }),
  );
  assert.equal(reads, 1);
  assert.equal(project.sources[0].versions[0].original, original);
});

function databaseFixture(projects, fresh = false) {
  const operations = [];
  let closed = false;
  let aborted = false;
  const factory = {
    open(name) {
      operations.push(["open", name]);
      const request = {
        transaction: {
          abort() {
            aborted = true;
          },
        },
      };
      request.result = {
        objectStoreNames: { contains: (name) => name === "workspaces" },
        close() {
          closed = true;
        },
        transaction(name, mode) {
          operations.push(["transaction", name, mode]);
          return {
            objectStore() {
              return {
                get(key) {
                  operations.push(["get", key]);
                  const read = { result: { data: { projects } } };
                  queueMicrotask(() => read.onsuccess());
                  return read;
                },
              };
            },
          };
        },
      };
      queueMicrotask(() =>
        fresh ? request.onupgradeneeded() : request.onsuccess(),
      );
      return request;
    },
  };
  return { factory, operations, closed: () => closed, aborted: () => aborted };
}
test("recovery reads the existing workspace without upgrades, seeds or writes", async () => {
  const projects = [makeProject("Untouched", "en")];
  const before = structuredClone(projects);
  const db = databaseFixture(projects);
  assert.deepEqual(await readSavedProjects(db.factory), projects);
  assert.deepEqual(db.operations, [
    ["open", "folio-workspace"],
    ["transaction", "workspaces", "readonly"],
    ["get", "main"],
  ]);
  assert.equal(db.closed(), true);
  assert.deepEqual(projects, before);
});
test("recovery does not create an empty workspace when no database exists", async () => {
  const db = databaseFixture(undefined, true);
  assert.deepEqual(await readSavedProjects(db.factory), []);
  assert.equal(db.aborted(), true);
  assert.equal(db.operations.length, 1);
});
test("unreadable project indexes fail without writing or replacing saved data", async () => {
  const db = databaseFixture([{ broken: true }]);
  await assert.rejects(readSavedProjects(db.factory), /could not be read/);
  assert.equal(db.closed(), true);
  assert.ok(db.operations.every((op) => !op.includes("readwrite")));
});
test("canceling a worker export terminates it and rejects without altering the project", async (t) => {
  const originalWorker = globalThis.Worker;
  let worker;
  let terminated = 0;
  globalThis.Worker = class {
    constructor() {
      worker = this;
    }
    postMessage(project) {
      this.input = project;
    }
    terminate() {
      terminated++;
    }
  };
  t.after(() => {
    globalThis.Worker = originalWorker;
  });
  const project = makeProject("Worker cancel", "en");
  const before = structuredClone(project);
  const controller = new AbortController();
  const pending = prepareBackup(project, { signal: controller.signal });
  const rejected = assert.rejects(pending);
  assert.equal(worker.input, project);
  controller.abort();
  await rejected;
  assert.equal(terminated, 1);
  assert.deepEqual(project, before);
});
