import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { makeProject } from "../lib/folio/model.ts";
import { sourceFromText } from "../lib/folio/files.ts";
import { findPassages, evidenceExists } from "../lib/folio/research.ts";
import { buildDecisionProject } from "../lib/folio/decision-project.ts";
import { decisionProgress } from "../lib/folio/decision-progress.ts";
import { searchComparison } from "../lib/folio/comparison-search.ts";
import { cellStatus, comparisonProgress } from "../lib/folio/comparison.ts";
import {
  applyConclusionChanges,
  validConclusionLinks,
} from "../lib/folio/conclusions.ts";
import {
  insertLinkedComparison,
  linkedBriefItems,
  updateLinkedBrief,
} from "../lib/folio/linked-brief.ts";
import {
  createDelivery,
  deliveryHtml,
  deliveryMarkdown,
} from "../lib/folio/delivery.ts";
import { collectCitations } from "../lib/folio/integrity.ts";
import { buildBackupBlob } from "../lib/folio/backup.ts";
import { restoreBackup } from "../lib/folio/backup-restore.ts";

// Labels were frozen before first execution. Never derive them from the algorithm.
const directory = new URL("../evals/real-material-decision/", import.meta.url);
const hashes = {
  "sources.json":
    "690caf7525b75128b582833f92d9344b33575ccf866501fa882663e379f04bb4",
  "labels.json":
    "628c081fb529540815e483b05569cbf4ee18054c403e3b4143366f443fb0a9d9",
};
async function frozen(name) {
  // Git may use CRLF on Windows; only normalize line endings, not JSON values.
  const text = (await readFile(new URL(name, directory), "utf8")).replaceAll(
    "\r\n",
    "\n",
  );
  assert.equal(
    createHash("sha256").update(text).digest("hex"),
    hashes[name],
    `${name} changed after label freeze`,
  );
  return JSON.parse(text);
}
const [corpus, labels] = await Promise.all([
  frozen("sources.json"),
  frozen("labels.json"),
]);
const reviewTime = "2026-11-18T00:00:00.000Z";
const passageResults = [],
  batchResults = [],
  crossLanguageResults = [],
  workflows = [];
const projects = new Map();
const persisted = (value) => JSON.parse(JSON.stringify(value));

function importedText(source, language) {
  const attribution = `Source: ${source.publisher}, ${source.title}. ${source.url}\nAccessed ${source.accessedOn}.`;
  const translation =
    language === "zh"
      ? "本评估作者翻译，非 NASA 官方译文。 / Translation by the evaluation author; not an official NASA translation."
      : "Frozen minimal table excerpt; separators and whitespace normalized.";
  return [attribution, translation, ...source[language]].join("\n\n");
}

function scorePassages(item, evidence, source, project) {
  const relevant = evidence.filter(
    (e) =>
      item.expected !== null &&
      e.sourceId === source.id &&
      e.page === 1 &&
      e.quote.includes(item.expected),
  );
  const exact = evidence.every((e) => evidenceExists(e, project));
  const scoped = evidence.every((e) => e.sourceId === source.id);
  return {
    id: item.id,
    query: item.query,
    positive: item.expected !== null,
    expected: item.expected,
    returned: evidence.length,
    relevant: relevant.length,
    exact,
    scoped,
    pass:
      exact &&
      scoped &&
      (item.expected === null
        ? evidence.length === 0
        : relevant.length > 0 && relevant.length === evidence.length),
    // Retain observed passages so extra/incorrect results are auditable.
    quotes: evidence.map((e) => e.quote),
  };
}

for (const language of ["en", "zh"]) {
  const scenario = labels.scenario[language];
  let project = makeProject(`NASA classroom decision (${language})`, language);
  project.reportTitle =
    language === "zh"
      ? "课堂望远镜主案例选择"
      : "Choosing a classroom telescope example";
  project.description =
    language === "zh"
      ? "真实 NASA 摘录的开发验收；作者设定的教学情境。"
      : "Development acceptance using real NASA excerpts and an author-designed educational scenario.";
  const sourceMap = new Map();
  for (const record of corpus.sources) {
    const source = await sourceFromText(
      `${record.id}.${language}`,
      importedText(record, language),
    );
    sourceMap.set(record.id, source);
    project.sources.push(source);
  }
  project = buildDecisionProject(
    project,
    {
      objective: scenario.objective,
      options: corpus.sources.map((record) => ({
        name: record.name,
        sourceIds: [sourceMap.get(record.id).id],
      })),
      criteria: scenario.criteria,
    },
    language,
  );
  assert.equal(decisionProgress(project).state, "fill-gap");

  // Keep criterion-name batch retrieval separate from field-aligned passage search.
  // A failed batch candidate does not silently become a successful manual query.
  const batch = searchComparison(project);
  const languageCases = labels.passageCases.filter(
    (item) => item.language === language,
  );
  const cells = [];
  for (const item of languageCases) {
    const source = sourceMap.get(item.source);
    const option = project.comparison.options.find((o) =>
      o.sourceIds.includes(source.id),
    );
    const criterion = project.comparison.criteria[item.criterion];
    const candidate = batch.find(
      (c) => c.optionId === option.id && c.criterionId === criterion.id,
    );
    batchResults.push(
      scorePassages(
        { ...item, id: `batch-${item.id}`, query: criterion.name },
        candidate.evidence,
        source,
        project,
      ),
    );
    const turn = findPassages(project, item.query, [source.id]);
    const result = scorePassages(item, turn.evidence, source, project);
    passageResults.push(result);
    assert.ok(
      result.pass,
      `${item.id}: field-aligned retrieval failed; do not alter the labels to hide a miss`,
    );
    assert.equal(
      turn.status,
      item.expected === null ? "insufficient" : "answered",
    );
    cells.push({
      optionId: option.id,
      criterionId: criterion.id,
      value: item.value ?? scenario.unknown,
      kind: item.kind,
      evidence: turn.evidence,
    });
  }
  projects.set(language, { project: structuredClone(project), sourceMap });

  const checks = [];
  const checked = (name, operation) => {
    operation();
    checks.push(name);
  };
  project = applyConclusionChanges(project, {
    comparison: { ...project.comparison, cells },
  });
  checked(
    "authored conclusions are unreviewed until an explicit review action",
    () => {
      assert.deepEqual(comparisonProgress(project), {
        total: 6,
        reviewed: 0,
        missing: 2,
        changed: 0,
        unreviewed: 4,
      });
      assert.equal(project.notebook.findings.length, 6);
      assert.ok(validConclusionLinks(project));
      assert.equal(decisionProgress(project).state, "review");
    },
  );

  // This simulates a user action to exercise the lifecycle. It is NOT evidence
  // that independent human reviewers evaluated the facts or recommendation.
  project = applyConclusionChanges(project, {
    comparison: {
      ...project.comparison,
      cells: project.comparison.cells.map((cell) =>
        cell.kind === "fact" ? { ...cell, reviewedAt: reviewTime } : cell,
      ),
    },
  });
  checked("unknowns stay unresolved and require written limitations", () => {
    assert.deepEqual(comparisonProgress(project), {
      total: 6,
      reviewed: 4,
      missing: 2,
      changed: 0,
      unreviewed: 0,
    });
    assert.equal(decisionProgress(project).state, "limitations");
    assert.ok(
      project.comparison.cells
        .filter((c) => c.kind === "unknown")
        .every((c) => !c.reviewedAt && c.evidence.length === 0),
    );
  });
  project = applyConclusionChanges(project, {
    comparison: { ...project.comparison, limitations: scenario.limitations },
  });
  assert.equal(decisionProgress(project).state, "recommendation");
  project = applyConclusionChanges(project, {
    comparison: {
      ...project.comparison,
      recommendation: scenario.recommendation,
    },
  });
  assert.equal(decisionProgress(project).state, "draft");
  project.content = insertLinkedComparison(project, language).content;
  checked(
    "linked brief retains facts, explicit unknowns and authored decision",
    () => {
      assert.equal(decisionProgress(project).state, "first-edition");
      assert.equal(linkedBriefItems(project)[0].status, "current");
      assert.equal(collectCitations(project.content).length, 4);
      const text = JSON.stringify(project.content);
      for (const item of languageCases.filter((c) => c.kind === "fact"))
        assert.ok(text.includes(item.value));
      assert.ok(text.includes(scenario.recommendation));
      assert.ok(text.includes(scenario.unknown));
      assert.ok(text.includes(scenario.limitations));
    },
  );

  const edition = createDelivery(project, language, {
    title: project.reportTitle,
    summary:
      "Author-designed acceptance scenario; simulated review actions; no external human review.",
    origin: "brief",
    findingIds: [],
    includeNotes: false,
  });
  const frozenHtml = deliveryHtml(edition),
    frozenMarkdown = deliveryMarkdown(edition);
  const frozenEdition = JSON.stringify(edition),
    originalBrief = persisted(project.content);
  project.deliveries = [edition];
  checked(
    "frozen delivery preserves four exact source/version/page references",
    () => {
      assert.equal(edition.references.length, 4);
      assert.ok(
        edition.references.every(
          (e) => e.status === "current" && evidenceExists(e, project),
        ),
      );
      assert.ok(!JSON.stringify(edition.content).includes("conclusionBlock"));
      assert.equal(decisionProgress(project).state, "saved-edition");
    },
  );

  const backup = await buildBackupBlob(project);
  const restored = await restoreBackup(
    new File([backup], "nasa-classroom.folio.json"),
  );
  checked(
    "backup restore retains connected records, brief, edition and citation IDs",
    () => {
      assert.notEqual(restored.id, project.id);
      // JSON intentionally omits optional undefined fields (such as reviewedAt).
      assert.deepEqual(restored.comparison, persisted(project.comparison));
      assert.deepEqual(restored.notebook, persisted(project.notebook));
      assert.deepEqual(restored.content, persisted(project.content));
      assert.deepEqual(restored.deliveries, persisted(project.deliveries));
      assert.ok(validConclusionLinks(restored));
      assert.equal(decisionProgress(restored).state, "saved-edition");
    },
  );
  for (const record of corpus.sources) {
    const original = sourceMap.get(record.id);
    const restoredSource = restored.sources.find((s) => s.id === original.id);
    assert.equal(restoredSource.versions[0].id, original.versions[0].id);
    assert.equal(
      await restoredSource.versions[0].original.text(),
      importedText(record, language),
    );
    assert.deepEqual(
      new Uint8Array(await restoredSource.versions[0].original.arrayBuffer()),
      new Uint8Array(await original.versions[0].original.arrayBuffer()),
    );
    assert.equal(restoredSource.versions[0].hash, original.versions[0].hash);
  }
  checks.push("both imported originals survive backup byte-for-byte");
  project = restored;

  const revisedRecord = corpus.sources.find(
    (s) => s.id === labels.revision.source,
  );
  const revisedSourceId = sourceMap.get(revisedRecord.id).id;
  const revisedText = [
    scenario.revisionNotice,
    ...revisedRecord[language].filter(
      (_, index) => index !== labels.revision.omitExcerptIndex,
    ),
  ].join("\n\n");
  const importedRevision = await sourceFromText(
    `${revisedRecord.id}.${language}.simulated-revision`,
    revisedText,
  );
  const beforeRevisionCells = structuredClone(project.comparison.cells);
  project = {
    ...project,
    sources: project.sources.map((s) =>
      s.id === revisedSourceId
        ? { ...s, versions: [...s.versions, importedRevision.versions[0]] }
        : s,
    ),
  };
  checked(
    "simulated source revision flags only that option without overwriting old evidence",
    () => {
      assert.deepEqual(project.comparison.cells, beforeRevisionCells);
      const statuses = project.comparison.cells.map((cell) =>
        cellStatus(cell, project),
      );
      assert.equal(
        statuses.filter((s) => s === "changed").length,
        labels.revision.expectedChangedCells,
      );
      assert.equal(
        statuses.filter((s) => s !== "changed").length,
        labels.revision.expectedUnchangedCells,
      );
      assert.ok(
        project.comparison.cells
          .flatMap((c) => c.evidence)
          .every((e) => evidenceExists(e, project)),
      );
      assert.equal(decisionProgress(project).state, "changed");
      const mirrorCase = languageCases.find(
        (c) => c.source === revisedRecord.id && c.criterion === 0,
      );
      const turn = findPassages(project, mirrorCase.query, [revisedSourceId]);
      assert.equal(
        turn.evidence.length,
        labels.revision.expectedMirrorSearchResults,
      );
      assert.equal(turn.status, "insufficient");
    },
  );
  checked(
    "working brief changes only on explicit update; old delivery remains frozen",
    () => {
      assert.deepEqual(project.content, originalBrief);
      assert.equal(linkedBriefItems(project)[0].status, "updated");
      project.content = updateLinkedBrief(
        project,
        linkedBriefItems(project)[0],
      );
      assert.notDeepEqual(project.content, originalBrief);
      assert.equal(JSON.stringify(project.deliveries[0]), frozenEdition);
      assert.equal(deliveryHtml(project.deliveries[0]), frozenHtml);
      assert.equal(deliveryMarkdown(project.deliveries[0]), frozenMarkdown);
    },
  );
  const afterRevisionBackup = await buildBackupBlob(project);
  const final = await restoreBackup(
    new File([afterRevisionBackup], "nasa-revised.folio.json"),
  );
  checked(
    "second backup retains both revisions, review warning and original frozen delivery",
    () => {
      assert.ok(validConclusionLinks(final));
      assert.equal(
        final.sources.find((s) => s.id === revisedSourceId).versions.length,
        2,
      );
      assert.equal(decisionProgress(final).state, "changed");
      assert.equal(JSON.stringify(final.deliveries[0]), frozenEdition);
      assert.equal(deliveryHtml(final.deliveries[0]), frozenHtml);
      assert.deepEqual(final.content, persisted(project.content));
      assert.ok(
        final.comparison.cells
          .flatMap((c) => c.evidence)
          .every((e) => evidenceExists(e, final)),
      );
    },
  );
  assert.equal(
    await final.sources
      .find((s) => s.id === revisedSourceId)
      .versions[1].original.text(),
    revisedText,
  );
  workflows.push({
    language,
    passed: true,
    checks,
    backupBytes: backup.size,
    afterRevisionBackupBytes: afterRevisionBackup.size,
  });
}

for (const item of labels.crossLanguageProbes) {
  const { project, sourceMap } = projects.get(item.sourceLanguage);
  const source = sourceMap.get(item.source);
  const turn = findPassages(project, item.query, [source.id]);
  crossLanguageResults.push(
    scorePassages(item, turn.evidence, source, project),
  );
}

const summarize = (results) => {
  const positive = results.filter((r) => r.positive),
    negative = results.filter((r) => !r.positive);
  const returned = results.reduce((n, r) => n + r.returned, 0);
  const relevant = results.reduce((n, r) => n + r.relevant, 0);
  return {
    cases: results.length,
    strictPasses: results.filter((r) => r.pass).length,
    positiveCases: positive.length,
    positiveRecallHits: positive.filter((r) => r.relevant > 0).length,
    negativeCases: negative.length,
    correctAbstentions: negative.filter((r) => r.returned === 0).length,
    returnedPassages: returned,
    relevantReturnedPassages: relevant,
    passagePrecision: returned ? relevant / returned : null,
    allQuotesExact: results.every((r) => r.exact),
    allSourcesScoped: results.every((r) => r.scoped),
  };
};
const report = {
  evaluation: "Real-material decision workflow acceptance",
  sourceAccessDate: corpus.frozenOn,
  frozenSha256: hashes,
  hashEncoding: "UTF-8, CRLF normalized to LF; no other normalization",
  executedAt: new Date().toISOString(),
  runtime: process.version,
  methodology:
    "Author-designed deterministic production-function acceptance, using frozen primary-source excerpts and pre-execution labels. Review actions and source revisions are simulated. No model, live network, browser, cloud writes or independent human reviewers are involved in execution.",
  fieldAlignedPassages: {
    ...summarize(passageResults),
    results: passageResults,
  },
  criterionNameBatch: { ...summarize(batchResults), results: batchResults },
  crossLanguage: {
    ...summarize(crossLanguageResults),
    results: crossLanguageResults,
  },
  workflows,
  limitations: [
    "Two tiny sources and one author-designed educational decision in two languages; not representative or held out.",
    "Source-field-aligned queries were deliberately labeled before execution; general criterion names are separately scored and can miss evidence.",
    "Chinese material is the evaluation author's translation, not an independently reviewed NASA translation; same-language success is not cross-language success.",
    "The recommendation and limitation text are authored inputs, not generated answers; no answer accuracy, scientific recommendation quality, user effort or time saved is measured.",
    "No PDF extraction, OCR, browser UX, accessibility, full-document scale, GPU/model inference, local database persistence or cloud account behavior is evaluated here.",
    "Removing the mirror row is a synthetic local revision to test lifecycle handling, not a claim that NASA revised its specifications.",
    "Diagnostic batch and cross-language misses remain failures in their own metrics; they are not relabeled as successful abstention.",
  ],
};
if (process.argv.includes("--write-results"))
  await writeFile(
    new URL("results.json", directory),
    `${JSON.stringify(report, null, 2)}\n`,
  );
if (process.argv.includes("--json"))
  console.log(JSON.stringify(report, null, 2));
else {
  for (const [name, results] of Object.entries({
    fieldAlignedPassages: report.fieldAlignedPassages,
    criterionNameBatch: report.criterionNameBatch,
    crossLanguage: report.crossLanguage,
  }))
    console.log(
      `${name}: ${results.strictPasses}/${results.cases}; positive recall ${results.positiveRecallHits}/${results.positiveCases}; abstentions ${results.correctAbstentions}/${results.negativeCases}.`,
    );
  console.log(
    `Workflow invariants: ${workflows.filter((w) => w.passed).length}/${workflows.length}; no AI answer accuracy or user time claim.`,
  );
}
// Lifecycle regressions/field-aligned misses fail above. Optional strict mode
// also fails on known diagnostic gaps, useful when improving general retrieval.
if (
  process.argv.includes("--strict") &&
  [...batchResults, ...crossLanguageResults].some((r) => !r.pass)
)
  process.exitCode = 1;
