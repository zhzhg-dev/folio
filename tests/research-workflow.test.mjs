import test from "node:test";
import assert from "node:assert/strict";
import { fixtureProject } from "../evals/retrieval-fixtures.mjs";
import {
  findPassages,
  validResearch,
  parseAnswer,
} from "../lib/folio/research.ts";
import { retrieve } from "../lib/folio/retrieval.ts";
import {
  researchInput,
  findPassagesAsync,
} from "../lib/folio/research-task.ts";
import { buildBackupBlob } from "../lib/folio/backup.ts";
import { restoreBackup } from "../lib/folio/files.ts";

test("review checkmarks survive backup restore and reject unknown or duplicate evidence", async () => {
  const p = fixtureProject();
  const turn = findPassages(p, "annual budget", ["plan"]);
  turn.reviewedEvidenceIds = [turn.evidence[0].id];
  p.research = {
    question: "",
    mode: "passages",
    selectedSourceIds: ["plan"],
    turns: [turn],
  };
  const restored = await restoreBackup(
    new File([await buildBackupBlob(p)], "review.folio.json"),
  );
  assert.deepEqual(restored.research, p.research);
  assert.ok(validResearch(p.research));
  turn.reviewedEvidenceIds = ["E999"];
  assert.equal(validResearch(p.research), false);
  turn.reviewedEvidenceIds = [turn.evidence[0].id, turn.evidence[0].id];
  assert.equal(validResearch(p.research), false);
});
test("a follow-up searches its new topic rather than requiring the previous fact in the same passage", () => {
  const result = findPassages(
    fixtureProject(),
    "What about its cost?",
    ["plan"],
    "When will Atlas launch?",
  );
  assert.ok(result.evidence.some((e) => e.quote.includes("12 dollars")));
  assert.ok(!result.evidence.some((e) => e.quote.includes("October")));
});
test("topic summaries cannot bypass no-evidence filtering", () => {
  const p = fixtureProject();
  assert.deepEqual(retrieve(p, "Summarize Jupiter geology", ["plan"]), []);
  assert.ok(retrieve(p, "Summarize the main ideas", ["plan"]).length);
  assert.ok(retrieve(p, "概括资料中的主要观点", ["cn"]).length);
});
test("search payload retains source labels but omits originals, earlier revisions and document history", () => {
  const p = fixtureProject();
  p.sources[0].versions[0].original = new Blob(["original"]);
  p.sources[0].versions.push({ ...p.sources[0].versions[0], id: "v2" });
  p.snapshots = [{ huge: true }];
  const input = researchInput(p, ["plan"]);
  assert.equal(input.sources[0].versions.length, 1);
  assert.equal(input.sources[0].versions[0].original, undefined);
  assert.equal(input.sources[1].versions.length, 0);
  assert.deepEqual(input.snapshots, []);
  assert.deepEqual(
    retrieve(input, "annual budget", ["plan"]),
    retrieve(p, "annual budget", ["plan"]),
  );
});
test("search workers terminate on success, cancellation, failure and deadline; late results are ignored", async (t) => {
  const prior = globalThis.Worker;
  const workers = [];
  globalThis.Worker = class {
    terminated = false;
    constructor() {
      workers.push(this);
    }
    postMessage(data) {
      this.input = data;
    }
    terminate() {
      this.terminated = true;
    }
  };
  t.after(() => {
    globalThis.Worker = prior;
  });
  const p = fixtureProject();
  const a = findPassagesAsync(p, "annual budget", ["plan"]);
  const turn = findPassages(p, "annual budget", ["plan"]);
  workers[0].onmessage({ data: { turn } });
  assert.deepEqual(await a, turn);
  assert.ok(workers[0].terminated);
  const cancel = new AbortController();
  const b = findPassagesAsync(p, "budget", ["plan"], undefined, cancel.signal);
  const rejected = assert.rejects(b, /aborted/);
  cancel.abort();
  workers[1].onmessage({ data: { turn } });
  await rejected;
  assert.ok(workers[1].terminated);
  const c = findPassagesAsync(p, "budget", ["plan"]);
  workers[2].onerror();
  await assert.rejects(c, /Could not run search/);
  assert.ok(workers[2].terminated);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const d = findPassagesAsync(p, "budget", ["plan"]);
  const deadline = assert.rejects(d, /timed out/);
  t.mock.timers.tick(15_000);
  await deadline;
  assert.ok(workers[3].terminated);
  const before = workers.length;
  await assert.rejects(
    findPassagesAsync(p, "budget", ["plan"], undefined, cancel.signal),
  );
  assert.equal(workers.length, before);
});
test("malformed AI objects are rejected with a useful message", () => {
  assert.throws(() => parseAnswer("null", []), /Incomplete answer/);
  assert.throws(
    () => parseAnswer('{"status":"answered","paragraphs":[null]}', []),
    /invalid citations/,
  );
});
