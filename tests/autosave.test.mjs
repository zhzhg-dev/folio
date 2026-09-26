import test from "node:test";
import assert from "node:assert/strict";
import { createAutosave } from "../lib/folio/autosave.ts";
const tick = () => new Promise((resolve) => setImmediate(resolve));
test("slow saves coalesce edits and only announce saved for the latest revision", async () => {
  const writes = [],
    states = [],
    release = [];
  const queue = createAutosave(
    (v) => {
      writes.push(v);
      return new Promise((resolve) => release.push(resolve));
    },
    (state) => states.push(state),
    60000,
  );
  queue.schedule("first");
  const pending = queue.flush();
  queue.schedule("second");
  queue.schedule("third");
  release[0]();
  await tick();
  assert.deepEqual(writes, ["first", "third"]);
  assert.ok(!states.includes("saved"));
  release[1]();
  await pending;
  assert.equal(states.at(-1), "saved");
  queue.dispose();
});
test("failed write remains an error until a later edit is successfully saved", async () => {
  const states = [];
  let fails = true;
  const queue = createAutosave(
    async () => {
      if (fails) throw new Error("quota");
    },
    (state, error) => states.push([state, error?.message]),
    60000,
  );
  queue.schedule("one");
  await queue.flush();
  assert.deepEqual(states.at(-1), ["error", "quota"]);
  fails = false;
  queue.schedule("two");
  await queue.flush();
  assert.equal(states.at(-1)[0], "saved");
  queue.dispose();
});
test("disposed queue does not write queued work or emit late completion", async () => {
  let done,
    calls = 0;
  const states = [];
  const queue = createAutosave(
    () => {
      calls++;
      return new Promise((resolve) => (done = resolve));
    },
    (state) => states.push(state),
    60000,
  );
  queue.schedule("one");
  const running = queue.flush();
  queue.schedule("two");
  queue.dispose();
  done();
  await running;
  assert.equal(calls, 1);
  assert.ok(!states.includes("saved"));
});
