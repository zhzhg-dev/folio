import test from "node:test";
import assert from "node:assert/strict";
import {
  comparisonExample,
  comparisonBrief,
  comparisonProgress,
  cellStatus,
  validComparison,
} from "../lib/folio/comparison.ts";
import {
  searchComparison,
  comparisonSearchKey,
  reviewItems,
  currentQuote,
} from "../lib/folio/comparison-search.ts";
import { sourceFromText, markdown } from "../lib/folio/files.ts";
import { buildBackupBlob } from "../lib/folio/backup.ts";
import { restoreBackup } from "../lib/folio/backup-restore.ts";
import { evidenceExists } from "../lib/folio/research.ts";

// Fixed fictional acceptance tasks. These are development checks, not a held-out benchmark.
const tasks = [
  [
    "annual condition",
    "pricing",
    "Pricing is USD 18 per agent per month, billed annually.",
    "billed annually",
  ],
  [
    "monthly alternative",
    "cost",
    "Monthly cost is USD 24 per agent. No annual commitment is required.",
    "No annual commitment",
  ],
  [
    "Chinese source",
    "价格",
    "价格为每位坐席每月 18 美元，需要按年付款。",
    "按年付款",
  ],
  [
    "Chinese question, English source",
    "存储",
    "Records are stored locally on this device.",
    "locally",
  ],
  [
    "English question, Chinese source",
    "encryption",
    "导出的备份没有加密，必须妥善保管。",
    "没有加密",
  ],
  [
    "negative feature",
    "live chat",
    "Live chat is not included in the base plan.",
    "not included",
  ],
  [
    "conditional feature",
    "export",
    "CSV export is available only for administrators on the Pro plan.",
    "only for administrators",
  ],
  [
    "retention period",
    "retention",
    "Data retention is 30 days after the contract ends.",
    "30 days",
  ],
  [
    "unsupported question",
    "zebrafish telemetry",
    "The team offers email support during business hours.",
    null,
  ],
  [
    "contradictory passages",
    "export",
    "The overview says export is included.\n\nThe contract says export is not included in the base plan.",
    "not included",
  ],
];
for (const [name, query, text, expected] of tasks) {
  test(`complete comparison task: ${name}`, async () => {
    const p = comparisonExample("en");
    const own = await sourceFromText("Candidate A", text);
    const foreign = await sourceFromText(
      "Candidate B",
      "Pricing cost export encryption storage retention live chat zebrafish telemetry: FOREIGN SOURCE.",
    );
    p.sources = [own, foreign];
    p.comparison = {
      objective: name,
      constraints: "Keep applicable conditions",
      recommendation: "",
      limitations: "",
      options: [{ id: "a", name: "A", sourceIds: [own.id] }],
      criteria: [{ id: "c", name: "Decision criterion", query }],
      cells: [],
    };
    const before = structuredClone(p);
    const [result] = searchComparison(p);
    assert.deepEqual(p, before, "search must not modify the comparison");
    assert.ok(
      result.evidence.every(
        (e) => e.sourceId === own.id && evidenceExists(e, p),
      ),
    );
    if (expected) {
      assert.ok(
        result.evidence.some((e) => e.quote.includes(expected)),
        name,
      );
      const e = result.evidence.find((e) => e.quote.includes(expected));
      p.comparison.cells = [
        {
          optionId: "a",
          criterionId: "c",
          kind: "fact",
          value: e.quote,
          evidence: [e],
          reviewedAt: p.createdAt,
        },
      ];
      assert.equal(comparisonProgress(p).reviewed, 1);
    } else {
      assert.equal(result.evidence.length, 0);
      assert.equal(comparisonProgress(p).missing, 1);
    }
    p.content = { type: "doc", content: comparisonBrief(p, "en") };
    const textExport = markdown(p.content);
    assert.match(textExport, /Decision brief/);
    assert.ok(textExport.includes(expected || "To confirm"));
    const backup = await buildBackupBlob(p);
    const restored = await restoreBackup(new File([backup], "task.folio.json"));
    assert.deepEqual(restored.comparison, p.comparison);
    assert.deepEqual(restored.content, p.content);
    assert.equal(await restored.sources[0].versions[0].original.text(), text);
    if (expected) {
      const cell = p.comparison.cells[0];
      const revision = await sourceFromText(
        "Candidate A",
        "The terms have changed. Contact the provider for current details.",
      );
      own.versions.push(revision.versions[0]);
      assert.equal(cellStatus(cell, p), "changed");
      assert.ok(
        evidenceExists(cell.evidence[0], p),
        "old citation must remain resolvable",
      );
      assert.ok(
        markdown(p.content).includes(expected),
        "existing brief remains a snapshot",
      );
    }
  });
}
test("batch scope, search fingerprints and review priority react only to relevant changes", () => {
  const p = comparisonExample("en");
  const before = comparisonSearchKey(p);
  p.comparison.cells[0].value = "user edit";
  assert.equal(comparisonSearchKey(p), before);
  assert.equal(reviewItems(p)[0].status, "changed");
  assert.equal(reviewItems(p, "changed").length, 3);
  p.comparison.criteria[0].query = "annual pricing";
  assert.notEqual(comparisonSearchKey(p), before);
  assert.ok(validComparison(p.comparison));
  p.comparison.options[0].sourceIds = [];
  const results = searchComparison(p);
  assert.ok(
    results
      .filter((x) => x.optionId === p.comparison.options[0].id)
      .every((x) => !x.linked && !x.evidence.length),
  );
  p.comparison.criteria[0].query = "x".repeat(501);
  assert.equal(validComparison(p.comparison), false);
});
test("unchanged quotes can move to a new page; different wording cannot be silently upgraded", () => {
  const p = comparisonExample("en");
  const price = p.comparison.cells[0].evidence[0];
  assert.equal(currentQuote(price, p), undefined);
  const feature = p.comparison.cells[1].evidence[0];
  const exact = currentQuote(feature, p);
  assert.ok(exact);
  assert.notEqual(exact.versionId, feature.versionId);
  const latest = p.sources[0].versions.at(-1);
  latest.pages = [{ page: 7, text: feature.quote }];
  assert.equal(currentQuote(feature, p).page, 7);
  assert.ok(evidenceExists(feature, p));
});

test("restoration rejects duplicate sources, malformed pages and unsupported document nodes", async () => {
  const p = comparisonExample("en");
  for (const change of [
    (x) => x.sources.push(x.sources[0]),
    (x) => x.sources[0].versions[0].pages.push(null),
    (x) => x.content.content.push({ type: "script" }),
  ]) {
    const data = JSON.parse(await (await buildBackupBlob(p)).text());
    change(data.project);
    await assert.rejects(() =>
      restoreBackup(new File([JSON.stringify(data)], "bad.folio.json")),
    );
  }
});
