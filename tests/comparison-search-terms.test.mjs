import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { makeProject } from "../lib/folio/model.ts";
import { sourceFromText } from "../lib/folio/files.ts";
import { retrieve } from "../lib/folio/retrieval.ts";
import { evidenceExists } from "../lib/folio/research.ts";
import {
  comparisonQueryLines,
  storedComparisonQuery,
  comparisonSearchKey,
  searchComparison,
  searchComparisonCell,
  searchComparisonPassages,
} from "../lib/folio/comparison-search.ts";
import {
  findComparisonCandidates,
  findComparisonCellCandidates,
} from "../lib/folio/comparison-task.ts";
import { buildBackupBlob } from "../lib/folio/backup.ts";
import { restoreBackup } from "../lib/folio/backup-restore.ts";

async function fixture() {
  const p = makeProject("Search terms", "en");
  const english = await sourceFromText(
    "English",
    "Primary mirror diameter is 6.5 meters.\n\nMirror material is beryllium.\n\nMirror coating is gold.\n\nMirror segments: 18.",
  );
  const chinese = await sourceFromText(
    "Chinese",
    "主镜直径为 2.4 米。\n\n主镜材质为玻璃。",
  );
  const foreign = await sourceFromText(
    "Another option",
    "Primary mirror diameter: FOREIGN. 主镜直径：其他方案。",
  );
  p.sources = [english, chinese, foreign];
  p.comparison = {
    objective: "Compare source facts",
    constraints: "",
    recommendation: "",
    limitations: "",
    options: [
      { id: "a", name: "A", sourceIds: [english.id, chinese.id] },
      { id: "b", name: "B", sourceIds: [foreign.id] },
    ],
    criteria: [{ id: "mirror", name: "primary mirror diameter" }],
    cells: [
      {
        optionId: "a",
        criterionId: "mirror",
        kind: "unknown",
        value: "Not reviewed",
        evidence: [],
      },
    ],
  };
  return p;
}
const address = { optionId: "a", criterionId: "mirror" };
const keys = (evidence) =>
  evidence.map((e) => [e.sourceId, e.versionId, e.page, e.quote]);

test("query lines preserve 500-character legacy queries and reject rather than truncate extra input", () => {
  assert.deepEqual(comparisonQueryLines("x".repeat(500)), ["x".repeat(500)]);
  assert.deepEqual(comparisonQueryLines("  \n\r\n", "Default name"), [
    "Default name",
  ]);
  assert.deepEqual(comparisonQueryLines(" mirror\r\n\r\n主镜\rcoating "), [
    "mirror",
    "主镜",
    "coating",
  ]);
  assert.deepEqual(comparisonQueryLines("mirror\nmirror\n主镜"), [
    "mirror",
    "主镜",
  ]);
  assert.throws(() => comparisonQueryLines("x".repeat(501)), /500/);
  assert.throws(() => comparisonQueryLines("one\ntwo\nthree\nfour"), /3/);
  assert.throws(() => comparisonQueryLines("one\none\none\none"), /3/);
});

test("default and one-line batch/cell results preserve previous retrieval and do not edit findings", async () => {
  const p = await fixture();
  const before = structuredClone(p);
  const ids = p.comparison.options[0].sourceIds;
  assert.deepEqual(
    searchComparisonCell(p, address).evidence,
    retrieve(p, "primary mirror diameter", ids),
  );
  assert.deepEqual(
    searchComparison(p)[0].evidence,
    retrieve(p, "primary mirror diameter", ids).slice(0, 3),
  );
  assert.deepEqual(p, before);
  p.comparison.criteria[0].query = "mirror";
  assert.deepEqual(
    searchComparisonCell(p, address).evidence,
    retrieve(p, "mirror", ids),
  );
  assert.deepEqual(
    searchComparison(p)[0].evidence,
    retrieve(p, "mirror", ids).slice(0, 3),
  );
  p.comparison.criteria[0].query = " ";
  assert.deepEqual(
    searchComparisonCell(p, address).evidence,
    retrieve(p, "primary mirror diameter", ids),
  );
  assert.throws(
    () => searchComparisonCell(p, { ...address, optionId: "gone" }),
    /no longer exists/,
  );
});

test("separate language lines contribute ranked passages, deduplicate exact locations and stay scoped/latest", async () => {
  const p = await fixture();
  const [english, chinese, foreign] = p.sources;
  english.versions.unshift({
    ...english.versions[0],
    id: "old-version",
    text: "mirror OLD ONLY",
    pages: [{ page: 1, text: "mirror OLD ONLY" }],
  });
  p.comparison.criteria[0].query = "mirror\n主镜";
  const before = structuredClone(p);
  const cell = searchComparisonCell(p, address).evidence;
  assert.deepEqual(
    cell.map((e) => e.sourceId),
    [english.id, chinese.id, english.id, chinese.id, english.id, english.id],
  );
  assert.deepEqual(
    cell.map((e) => e.id),
    ["E1", "E2", "E3", "E4", "E5", "E6"],
  );
  assert.ok(
    cell.every(
      (e) =>
        e.sourceId !== foreign.id &&
        e.versionId !== "old-version" &&
        evidenceExists(e, p),
    ),
  );
  assert.deepEqual(searchComparison(p)[0].evidence, cell.slice(0, 3));
  const duplicate = searchComparisonPassages(p, "mirror\ncoating", [
    english.id,
  ]);
  assert.equal(duplicate.length, 4);
  assert.equal(
    new Set(keys(duplicate).map(JSON.stringify)).size,
    duplicate.length,
  );
  assert.ok(
    duplicate[1].quote.includes("coating"),
    "the second line's top match gets a turn before first-line rank 2",
  );
  assert.deepEqual(
    p,
    before,
    "candidate retrieval cannot add evidence or mark a conclusion reviewed",
  );
  const reversed = searchComparisonPassages(
    p,
    "主镜\nmirror",
    [english.id, chinese.id],
    3,
  );
  assert.equal(reversed[0].sourceId, chinese.id);
  assert.equal(reversed[1].sourceId, english.id);
});

test("an identical quote on a different source/page is not collapsed into one citation", async () => {
  const p = await fixture();
  const quote = "Mirror diameter is documented.";
  p.sources[0].versions[0].pages = [
    { page: 1, text: quote },
    { page: 2, text: quote },
  ];
  p.sources[1].versions[0].pages = [{ page: 1, text: quote }];
  const evidence = searchComparisonPassages(
    p,
    "mirror\ndiameter",
    p.comparison.options[0].sourceIds,
  );
  assert.equal(evidence.length, 3);
  assert.equal(new Set(keys(evidence).map(JSON.stringify)).size, 3);
});

test("explicit field queries address frozen NASA spectral wording without changing default scores or labels", async () => {
  const corpus = JSON.parse(
    await readFile(
      new URL("../evals/real-material-decision/sources.json", import.meta.url),
      "utf8",
    ),
  );
  for (const language of ["en", "zh"]) {
    const p = makeProject("NASA configured query", language);
    p.sources = await Promise.all(
      corpus.sources.map((s) => sourceFromText(s.id, s[language].join("\n\n"))),
    );
    p.comparison = {
      objective: "Read spectral coverage",
      constraints: "",
      recommendation: "",
      limitations: "",
      cells: [],
      options: p.sources.map((s) => ({
        id: s.id,
        name: s.name,
        sourceIds: [s.id],
      })),
      criteria: [
        {
          id: "coverage",
          name: language === "en" ? "Spectral coverage" : "光谱覆盖",
        },
      ],
    };
    assert.ok(searchComparison(p).every((r) => r.evidence.length === 0));
    p.comparison.criteria[0].query =
      language === "en"
        ? "wavelength coverage\nsensitivity to light"
        : "波长覆盖范围\n对光的敏感范围";
    const candidates = searchComparison(p);
    assert.deepEqual(
      candidates.map((r) => r.evidence.length),
      [1, 1],
    );
    assert.ok(candidates[0].evidence[0].quote.includes("28.5"));
    assert.ok(candidates[1].evidence[0].quote.includes("2500"));
    assert.equal(p.comparison.cells.length, 0);
  }
});

test("query configuration survives backup unchanged and changes only the search fingerprint", async () => {
  const p = await fixture();
  const original = structuredClone(p.comparison.cells);
  let key = comparisonSearchKey(p);
  for (const query of [
    "x".repeat(500),
    "mirror\r\n主镜\r\ncoating",
    "one\ntwo\nthree\nfour",
  ]) {
    p.comparison.criteria[0].query = query;
    const next = comparisonSearchKey(p);
    assert.notEqual(next, key);
    key = next;
    const restored = await restoreBackup(
      new File([await buildBackupBlob(p)], "query.folio.json"),
    );
    assert.equal(restored.comparison.criteria[0].query, query);
    assert.deepEqual(restored.comparison.cells, original);
  }
  // Older multiline backups remain recoverable and searchable as one legacy
  // query; the stored text is not silently rewritten or truncated.
  assert.doesNotThrow(() => searchComparison(p));
  assert.equal(p.comparison.criteria[0].query, "one\ntwo\nthree\nfour");
});

test("persisted four-line queries and names use legacy combined search without blocking other criteria", async () => {
  const original = " primary\r\n\r\n mirror\ndiameter\rmeters ";
  for (const field of ["query", "name"]) {
    const p = await fixture();
    p.comparison.criteria[0] = {
      id: "mirror",
      name: "Mirror",
      [field]: original,
    };
    p.comparison.criteria.push({ id: "other", name: "mirror" });
    const before = structuredClone(p);
    const expected = retrieve(
      p,
      "primary mirror diameter meters",
      p.comparison.options[0].sourceIds,
    );
    assert.ok(expected.length > 0);
    assert.equal(
      storedComparisonQuery(p.comparison.criteria[0]),
      "primary mirror diameter meters",
    );
    assert.deepEqual(searchComparisonCell(p, address).evidence, expected);
    const batch = searchComparison(p);
    assert.equal(batch.length, 4);
    assert.deepEqual(batch[0].evidence, expected.slice(0, 3));
    assert.ok(
      batch[1].evidence.length > 0,
      "an unrelated criterion must still search",
    );
    assert.deepEqual(p, before);
    assert.throws(
      () => searchComparisonCell(p, address, original),
      /3/,
      "an explicit new override remains strict",
    );
    const restored = await restoreBackup(
      new File([await buildBackupBlob(p)], "legacy-query.folio.json"),
    );
    assert.equal(restored.comparison.criteria[0][field], original);
    assert.deepEqual(
      searchComparisonCell(restored, address).evidence,
      expected,
    );
  }
});

test("comparison worker executes the same multiline logic for one cell and the batch", async (t) => {
  const previous = globalThis.self;
  const sent = [];
  globalThis.self = { postMessage: (value) => sent.push(value) };
  t.after(() => {
    if (previous === undefined) delete globalThis.self;
    else globalThis.self = previous;
  });
  await import("../lib/folio/comparison.worker.ts");
  const p = await fixture();
  p.comparison.criteria[0].query = "mirror\n主镜";
  self.onmessage({
    data: { project: p, cell: { address, query: "mirror\n主镜" } },
  });
  assert.deepEqual(sent.at(-1).results, [searchComparisonCell(p, address)]);
  sent.length = 0;
  self.onmessage({ data: { project: p } });
  assert.deepEqual(sent.at(-1).results, searchComparison(p));
  assert.equal(sent.filter((message) => "completed" in message).length, 2);
  for (const field of ["query", "name"]) {
    p.comparison.criteria[0] = {
      id: "mirror",
      name: "Mirror",
      [field]: "primary\nmirror\ndiameter\nmeters",
    };
    self.onmessage({ data: { project: p, cell: { address } } });
    assert.deepEqual(sent.at(-1).results, [searchComparisonCell(p, address)]);
    self.onmessage({ data: { project: p } });
    assert.deepEqual(sent.at(-1).results, searchComparison(p));
  }
});

test("cell and batch worker tasks clean up and ignore late results/progress after abort, failure or success", async (t) => {
  const previous = {
    Worker: globalThis.Worker,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  };
  const workers = [],
    deadlines = new Map(),
    durations = [];
  let nextTimer = 0,
    throwOnPost = false;
  globalThis.Worker = class {
    constructor() {
      workers.push(this);
    }
    postMessage(input) {
      this.input = input;
      if (throwOnPost) throw new Error("clone failure");
    }
    terminate() {
      this.terminated = true;
    }
  };
  globalThis.setTimeout = (fn, ms) => {
    const id = ++nextTimer;
    deadlines.set(id, fn);
    durations.push(ms);
    return id;
  };
  globalThis.clearTimeout = (id) => deadlines.delete(id);
  t.after(() => Object.assign(globalThis, previous));
  const p = await fixture();
  p.comparison.criteria[0].query = "mirror\n主镜";
  p.deliveries = [{ private: "DO NOT CLONE" }];
  for (const mode of ["cell", "batch"]) {
    const progress = [];
    const start = (signal) =>
      mode === "cell"
        ? findComparisonCellCandidates(p, address, "mirror\n主镜", signal)
        : findComparisonCandidates(p, signal, (n) => progress.push(n));
    let controller = new AbortController();
    const success = start(controller.signal);
    const first = workers.at(-1);
    assert.equal(durations.at(-1), mode === "cell" ? 15_000 : 60_000);
    assert.equal(first.input.project.deliveries, undefined);
    assert.equal(first.input.project.comparison.cells.length, 0);
    assert.ok(
      first.input.project.sources.every(
        (s) => s.versions.length <= 1 && !s.versions[0]?.original,
      ),
    );
    if (mode === "cell") {
      assert.equal(first.input.cell.query, "mirror\n主镜");
      assert.equal(
        first.input.project.sources[2].versions.length,
        0,
        "cell search must not clone another option's text",
      );
      assert.equal(first.input.project.comparison.options.length, 1);
    }
    const results =
      mode === "cell"
        ? [
            searchComparisonCell(
              first.input.project,
              address,
              first.input.cell.query,
            ),
          ]
        : searchComparison(first.input.project);
    first.onmessage({ data: { completed: 1, total: 2 } });
    first.onmessage({ data: { results } });
    assert.deepEqual(
      await success,
      mode === "cell" ? results[0].evidence : results,
    );
    const progressBefore = [...progress];
    first.onmessage({ data: { completed: 99, total: 99 } });
    assert.deepEqual(progress, progressBefore);
    assert.ok(first.terminated);
    assert.equal(deadlines.size, 0);

    controller = new AbortController();
    const canceled = start(controller.signal),
      canceledWorker = workers.at(-1);
    controller.abort();
    await assert.rejects(canceled, { name: "AbortError" });
    canceledWorker.onmessage({ data: { results } });
    canceledWorker.onmessage({ data: { completed: 99, total: 99 } });
    assert.deepEqual(progress, progressBefore);
    assert.ok(canceledWorker.terminated);

    const failed = start(new AbortController().signal);
    workers.at(-1).onerror();
    await assert.rejects(failed, /Could not start search/);
    assert.ok(workers.at(-1).terminated);
    const timed = start(new AbortController().signal);
    [...deadlines.values()][0]();
    await assert.rejects(timed, /timed out/);
    assert.ok(workers.at(-1).terminated);
    throwOnPost = true;
    await assert.rejects(start(new AbortController().signal), /clone failure/);
    throwOnPost = false;
    assert.ok(workers.at(-1).terminated);
    assert.equal(deadlines.size, 0);
    const count = workers.length;
    controller = new AbortController();
    controller.abort();
    await assert.rejects(start(controller.signal), { name: "AbortError" });
    assert.equal(workers.length, count);
  }
  for (const field of ["query", "name"]) {
    const original = "primary\nmirror\ndiameter\nmeters";
    p.comparison.criteria[0] = {
      id: "mirror",
      name: "Mirror",
      [field]: original,
    };
    const batch = findComparisonCandidates(
      p,
      new AbortController().signal,
      () => {},
    );
    const batchWorker = workers.at(-1);
    assert.equal(
      batchWorker.input.project.comparison.criteria[0][field],
      original,
    );
    batchWorker.onmessage({
      data: { results: searchComparison(batchWorker.input.project) },
    });
    assert.equal((await batch).length, 2);
    const cell = findComparisonCellCandidates(
      p,
      address,
      undefined,
      new AbortController().signal,
    );
    const cellWorker = workers.at(-1);
    assert.equal(
      cellWorker.input.project.comparison.criteria[0][field],
      original,
    );
    cellWorker.onmessage({
      data: {
        results: [
          searchComparisonCell(
            cellWorker.input.project,
            address,
            cellWorker.input.cell.query,
          ),
        ],
      },
    });
    assert.ok((await cell).length > 0);
    assert.ok(cellWorker.terminated && batchWorker.terminated);
    assert.equal(deadlines.size, 0);
  }
  const count = workers.length;
  await assert.rejects(
    findComparisonCellCandidates(
      p,
      address,
      "one\ntwo\nthree\nfour",
      new AbortController().signal,
    ),
    /3/,
  );
  await assert.rejects(
    findComparisonCellCandidates(
      p,
      { ...address, optionId: "gone" },
      "mirror",
      new AbortController().signal,
    ),
    /no longer exists/,
  );
  p.comparison.criteria[0].query = "x".repeat(501);
  await assert.rejects(
    findComparisonCandidates(p, new AbortController().signal, () => {}),
    /500/,
  );
  assert.equal(
    workers.length,
    count,
    "invalid requests must fail before allocating a worker",
  );
  p.sources[0].versions[0].pages = [{ page: 1, text: "m".repeat(8_000_001) }];
  await assert.rejects(
    findComparisonCellCandidates(
      p,
      address,
      "mirror",
      new AbortController().signal,
    ),
    /Too much text/,
  );
  assert.equal(workers.length, count);
});
