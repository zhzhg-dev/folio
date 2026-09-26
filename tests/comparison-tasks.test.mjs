import test from "node:test";
import assert from "node:assert/strict";
import { findComparisonCandidates } from "../lib/folio/comparison-task.ts";
import { restoreBackupAsync } from "../lib/folio/restore-task.ts";
import { comparisonExample } from "../lib/folio/comparison.ts";

test("batch and restore workers release resources on success, abort, error and deadline", async (t) => {
  const NativeWorker = globalThis.Worker,
    nativeTimer = globalThis.setTimeout,
    nativeClear = globalThis.clearTimeout;
  const jobs = [],
    deadlines = new Map();
  let sequence = 0;
  globalThis.Worker = class {
    constructor() {
      jobs.push(this);
    }
    postMessage(input) {
      this.input = input;
    }
    terminate() {
      this.terminated = true;
    }
  };
  globalThis.setTimeout = (fn) => {
    const id = ++sequence;
    deadlines.set(id, fn);
    return id;
  };
  globalThis.clearTimeout = (id) => deadlines.delete(id);
  t.after(() => {
    globalThis.Worker = NativeWorker;
    globalThis.setTimeout = nativeTimer;
    globalThis.clearTimeout = nativeClear;
  });
  for (const kind of ["batch", "restore"]) {
    const project = comparisonExample("en");
    const start = (signal) =>
      kind === "batch"
        ? findComparisonCandidates(project, signal, () => {})
        : restoreBackupAsync(new File(["{}"], "backup.json"), signal);
    let controller = new AbortController();
    const success = start(controller.signal);
    const first = jobs.at(-1);
    if (kind === "batch") {
      assert.equal(first.input.project.comparison.cells.length, 0);
      assert.ok(
        first.input.project.sources.every(
          (s) => s.versions.length <= 1 && !s.versions[0]?.original,
        ),
      );
      first.onmessage({ data: { results: [] } });
      assert.deepEqual(await success, []);
    } else {
      first.onmessage({ data: { project } });
      assert.equal(await success, project);
    }
    assert.ok(first.terminated);
    assert.equal(deadlines.size, 0);
    controller = new AbortController();
    const canceled = start(controller.signal);
    const canceledWorker = jobs.at(-1);
    controller.abort();
    await assert.rejects(canceled, { name: "AbortError" });
    canceledWorker.onmessage({ data: { results: [], project } });
    assert.ok(canceledWorker.terminated);
    const failed = start(new AbortController().signal);
    jobs.at(-1).onerror();
    await assert.rejects(failed);
    assert.ok(jobs.at(-1).terminated);
    const timed = start(new AbortController().signal);
    [...deadlines.values()][0]();
    await assert.rejects(timed, /timed out/);
    assert.ok(jobs.at(-1).terminated);
    const count = jobs.length;
    controller = new AbortController();
    controller.abort();
    await assert.rejects(start(controller.signal), { name: "AbortError" });
    assert.equal(jobs.length, count);
  }
});
test("oversized batch text is declined before a worker or index is allocated", async () => {
  const p = comparisonExample("en");
  p.sources[0].versions.at(-1).pages = [
    { page: 1, text: "a".repeat(8_000_001) },
  ];
  await assert.rejects(
    findComparisonCandidates(p, new AbortController().signal, () => {}),
    /Too much text/,
  );
});
