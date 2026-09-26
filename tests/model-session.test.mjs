import test from "node:test";
import assert from "node:assert/strict";
import { ModelSession } from "../lib/folio/model-session.ts";
const flush = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

test("concurrent model loads share one worker; release during setup rejects promptly", async () => {
  const session = new ModelSession();
  const init = deferred();
  let starts = 0;
  let stops = 0;
  const factory = ({ dispose }) => {
    starts++;
    dispose(() => stops++);
    return init.promise;
  };
  const first = session.load(factory);
  const second = session.load(factory);
  assert.equal(first, second);
  await flush();
  const rejected = assert.rejects(first, /stopped/);
  session.release();
  await rejected;
  assert.equal(starts, 1);
  assert.equal(stops, 1);
  assert.equal(session.snapshot().phase, "off");
  init.resolve({ old: true });
  await flush();
  assert.equal(session.snapshot().phase, "off");
});
test("a canceled load cannot overwrite a new session when it resolves late", async () => {
  const session = new ModelSession();
  const old = deferred();
  const first = session.load(() => old.promise);
  const rejected = assert.rejects(first);
  await flush();
  session.release();
  await rejected;
  await session.load(async () => "new model");
  old.resolve("old model");
  await flush();
  assert.equal(await session.run(async (model) => model), "new model");
  session.release();
});
test("cancellation before initialization prevents the worker from being created", async () => {
  const session = new ModelSession();
  let starts = 0;
  const task = session.load(async () => {
    starts++;
    return {};
  });
  const rejected = assert.rejects(task);
  session.release();
  await rejected;
  assert.equal(starts, 0);
});
test("generation cancellation rejects a hung request and permits a new session", async () => {
  const session = new ModelSession();
  let stops = 0;
  await session.load(async ({ dispose }) => {
    dispose(() => stops++);
    return {};
  });
  const answer = session.run(() => new Promise(() => {}));
  await assert.rejects(
    session.run(async () => "overlap"),
    /still running/,
  );
  const rejected = assert.rejects(answer, /stopped/);
  session.release("hidden");
  await rejected;
  assert.equal(stops, 1);
  assert.equal(session.snapshot().reason, "hidden");
  await session.load(async () => ({}));
  assert.equal(await session.run(async () => "new answer"), "new answer");
  session.release();
});
test("loading and generation deadlines release resources; idle time starts after an answer", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const session = new ModelSession({ loadMs: 50, runMs: 40, idleMs: 30 });
  let stops = 0;
  const loading = session.load(({ dispose }) => {
    dispose(() => stops++);
    return new Promise(() => {});
  });
  await flush();
  const loadFailure = assert.rejects(loading, /timed out/);
  t.mock.timers.tick(50);
  await loadFailure;
  assert.equal(stops, 1);
  assert.equal(session.snapshot().reason, "timeout");
  await session.load(async ({ dispose }) => {
    dispose(() => stops++);
    return {};
  });
  const run = session.run(() => new Promise(() => {}));
  const runFailure = assert.rejects(run, /timed out/);
  t.mock.timers.tick(40);
  await runFailure;
  assert.equal(stops, 2);
  await session.load(async () => ({}));
  t.mock.timers.tick(20);
  await session.run(async () => "done");
  t.mock.timers.tick(20);
  assert.equal(session.snapshot().phase, "ready");
  t.mock.timers.tick(10);
  assert.equal(session.snapshot().reason, "idle");
});
test("late cleanup registration after cancellation runs immediately", async () => {
  const session = new ModelSession();
  const pending = deferred();
  let stops = 0;
  const load = session.load(async ({ dispose }) => {
    await pending.promise;
    dispose(() => stops++);
    return {};
  });
  await flush();
  const rejected = assert.rejects(load);
  session.release();
  await rejected;
  pending.resolve();
  await flush();
  assert.equal(stops, 1);
});
