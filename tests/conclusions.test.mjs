import test from "node:test";
import assert from "node:assert/strict";
import { makeProject } from "../lib/folio/model.ts";
import {
  emptyNotebook,
  notebookFor,
  validNotebook,
} from "../lib/folio/notebook.ts";
import {
  archiveFinding,
  archiveQuestion,
  moveFinding,
  restoreNotebookItem,
} from "../lib/folio/notebook-actions.ts";
import {
  applyConclusionChanges,
  connectComparisonFindings,
  getLinkedFinding,
  isLinkedFindingArchived,
  validConclusionLinks,
} from "../lib/folio/conclusions.ts";

const reviewedAt = "2026-10-01T00:00:00.000Z";
function fixture(withNotebook = false) {
  const p = makeProject("Decision", "en");
  const quote = "The monthly price is USD 18 per agent.";
  p.sources = [
    {
      id: "source",
      name: "Terms",
      kind: "txt",
      color: "green",
      versions: [
        {
          id: "v1",
          text: quote,
          pages: [{ page: 1, text: quote }],
          createdAt: reviewedAt,
          hash: "fixture",
          size: quote.length,
        },
      ],
    },
  ];
  p.comparison = {
    objective: "Choose a plan",
    constraints: "Under USD 100",
    recommendation: "",
    limitations: "",
    options: [{ id: "option", name: "Harbor", sourceIds: ["source"] }],
    criteria: [{ id: "criterion", name: "Price" }],
    cells: [
      {
        optionId: "option",
        criterionId: "criterion",
        value: "Five seats cost USD 90.",
        kind: "judgment",
        reviewedAt,
        evidence: [
          {
            id: "e1",
            sourceId: "source",
            versionId: "v1",
            page: 1,
            quote,
            name: "Terms",
            label: "1",
          },
        ],
      },
    ],
  };
  if (withNotebook) p.notebook = emptyNotebook();
  return p;
}
const active = (p) => getLinkedFinding(p, p.comparison.cells[0]);
const changeCell = (p, patch) =>
  applyConclusionChanges(p, {
    comparison: {
      ...p.comparison,
      cells: p.comparison.cells.map((cell, i) =>
        i === 0 ? { ...cell, ...patch } : cell,
      ),
    },
  });
const changeFinding = (p, patch) =>
  applyConclusionChanges(p, {
    notebook: {
      ...p.notebook,
      findings: p.notebook.findings.map((f) =>
        f.id === active(p).id ? { ...f, ...patch } : f,
      ),
    },
  });

test("explicit legacy connection retains projection identity and original project", () => {
  const p = fixture();
  const before = structuredClone(p);
  const projected = notebookFor(p).findings[0];
  const linked = connectComparisonFindings(p);
  assert.deepEqual(p, before);
  assert.equal(active(linked).id, projected.id);
  assert.equal(active(linked).revision, 1);
  assert.equal(active(linked).reviewedAt, reviewedAt);
  assert.equal(linked.comparison.findingsLinked, true);
  assert.ok(validNotebook(linked.notebook));
  assert.ok(validConclusionLinks(linked));
  assert.deepEqual(connectComparisonFindings(linked), linked);
});

test("explicit connection never merges an independently persisted notebook finding", () => {
  const p = fixture();
  p.notebook = notebookFor(p);
  p.notebook.findings[0].note = "Independent notebook note";
  const original = structuredClone(p.notebook.findings[0]);
  const linked = connectComparisonFindings(p);
  assert.equal(linked.notebook.findings.length, 2);
  assert.notEqual(active(linked).id, original.id);
  assert.deepEqual(
    linked.notebook.findings.find((f) => f.id === original.id),
    { ...original, revision: 1 },
  );
});

test("valid legacy comparisons with blank labels or escaped long addresses yield valid notebooks", () => {
  const p = fixture();
  p.comparison.criteria[0].name = "";
  p.comparison.options[0].id = '"'.repeat(200);
  p.comparison.criteria[0].id = "\\".repeat(200);
  p.comparison.cells[0].optionId = p.comparison.options[0].id;
  p.comparison.cells[0].criterionId = p.comparison.criteria[0].id;
  const before = structuredClone(p);
  const linked = connectComparisonFindings(p);
  assert.ok(validNotebook(linked.notebook));
  assert.ok(validConclusionLinks(linked));
  assert.ok(active(linked).id.length <= 500);
  assert.equal(linked.notebook.questions[0].title, "Comparison criterion");
  assert.deepEqual(p, before);
});

test("new empty comparisons opt in once, then automatically link new non-empty cells", () => {
  const p = fixture(true);
  const first = p.comparison.cells[0];
  p.comparison.cells = [];
  const enabled = connectComparisonFindings(p);
  assert.equal(enabled.comparison.findingsLinked, true);
  assert.equal(enabled.notebook.findings.length, 0);
  const linked = applyConclusionChanges(enabled, {
    comparison: { ...enabled.comparison, cells: [first] },
  });
  assert.equal(linked.notebook.findings.length, 1);
  assert.equal(active(linked).value, first.value);
  assert.ok(validConclusionLinks(linked));
});

test("independent legacy comparison edits stay independent until explicitly connected", () => {
  const p = fixture(true);
  const changed = changeCell(p, { value: "An independent conclusion" });
  assert.equal(changed.notebook.findings.length, 0);
  assert.equal(changed.comparison.cells[0].findingId, undefined);
});

test("notebook edits propagate to comparison, clear review and advance the same conclusion", () => {
  const p = connectComparisonFindings(fixture());
  const before = structuredClone(p);
  const next = changeFinding(p, {
    value: "Five seats fit our budget, with conditions.",
  });
  assert.equal(active(next).id, active(p).id);
  assert.equal(active(next).revision, 2);
  assert.equal(active(next).reviewedAt, undefined);
  assert.equal(next.comparison.cells[0].value, active(next).value);
  assert.equal(next.comparison.cells[0].reviewedAt, undefined);
  assert.deepEqual(next.sources, p.sources);
  assert.deepEqual(p, before);
  assert.ok(validConclusionLinks(next));
});

test("comparison edits update the canonical finding without losing private notes", () => {
  const p = changeFinding(connectComparisonFindings(fixture()), {
    note: "Confirm the applicable conditions",
  });
  const next = changeCell(p, {
    value: "A new conclusion from the same source.",
  });
  assert.equal(active(next).value, "A new conclusion from the same source.");
  assert.equal(active(next).note, "Confirm the applicable conditions");
  assert.equal(active(next).revision, active(p).revision + 1);
  assert.equal(active(next).reviewedAt, undefined);
  assert.ok(validConclusionLinks(next));
});

test("note changes and review-only actions each advance revision; unchanged saves do not", () => {
  const p = connectComparisonFindings(fixture());
  const noted = changeFinding(p, { note: "A new condition to check" });
  assert.equal(active(noted).revision, 2);
  assert.equal(noted.comparison.cells[0].reviewedAt, undefined);
  const reviewed = changeCell(noted, { reviewedAt });
  assert.equal(active(reviewed).revision, 3);
  assert.equal(active(reviewed).reviewedAt, reviewedAt);
  assert.deepEqual(changeFinding(reviewed, {}), reviewed);
  const semantic = changeFinding(reviewed, { kind: "fact", reviewedAt });
  assert.equal(active(semantic).revision, 4);
  assert.equal(active(semantic).reviewedAt, undefined);
});

test("editing and explicitly reviewing the revised wording in one save keeps the new review", () => {
  const p = connectComparisonFindings(fixture());
  const freshReview = "2026-10-29T12:00:00.000Z";
  for (const edit of [changeCell, changeFinding]) {
    const next = edit(p, {
      value: "Rechecked conclusion using the same source.",
      reviewedAt: freshReview,
    });
    assert.equal(active(next).reviewedAt, freshReview);
    assert.equal(next.comparison.cells[0].reviewedAt, freshReview);
    assert.equal(active(next).revision, 2);
    assert.ok(validConclusionLinks(next));
    assert.deepEqual(applyConclusionChanges(p, next), next);
    assert.deepEqual(applyConclusionChanges(next, next), next);
  }
});

test("fresh review cannot approve missing, unknown, stale, or unlocatable evidence", () => {
  const freshReview = "2026-10-29T12:00:00.000Z";
  for (const prepare of [
    (p) => ({ kind: "unknown" }),
    (p) => ({ kind: "fact", evidence: [] }),
    (p) => {
      p.sources[0].versions.push({ ...p.sources[0].versions[0], id: "v2" });
      return {};
    },
    (p) => ({
      evidence: [
        { ...active(p).evidence[0], quote: "This passage is absent." },
      ],
    }),
  ]) {
    const p = connectComparisonFindings(fixture());
    const patch = prepare(p);
    const next = changeCell(p, {
      ...patch,
      value: "A new claim",
      reviewedAt: freshReview,
    });
    assert.equal(active(next).reviewedAt, undefined);
    assert.equal(next.comparison.cells[0].reviewedAt, undefined);
    assert.ok(validConclusionLinks(next));
  }
  const p = changeCell(connectComparisonFindings(fixture()), {
    kind: "unknown",
  });
  const next = changeCell(p, { reviewedAt: freshReview });
  assert.equal(active(next).reviewedAt, undefined);
  assert.equal(active(next).revision, active(p).revision);
});

test("surrounding context changes always require review after that change", () => {
  const p = connectComparisonFindings(fixture());
  const freshReview = "2026-10-29T12:00:00.000Z";
  const renamed = applyConclusionChanges(p, {
    comparison: {
      ...p.comparison,
      options: [{ ...p.comparison.options[0], name: "A different plan" }],
      cells: p.comparison.cells.map((c) => ({ ...c, reviewedAt: freshReview })),
    },
  });
  assert.equal(active(renamed).reviewedAt, undefined);
  const questioned = applyConclusionChanges(p, {
    notebook: {
      ...p.notebook,
      questions: [
        { ...p.notebook.questions[0], title: "A different question" },
      ],
      findings: p.notebook.findings.map((f) => ({
        ...f,
        reviewedAt: freshReview,
      })),
    },
  });
  assert.equal(active(questioned).reviewedAt, undefined);
  assert.equal(active(questioned).revision, 2);
});

test("renaming comparison context and moving findings invalidate review without losing links", () => {
  const p = connectComparisonFindings(fixture());
  const renamed = applyConclusionChanges(p, {
    comparison: {
      ...p.comparison,
      options: [{ ...p.comparison.options[0], name: "Harbor premium" }],
    },
  });
  assert.equal(active(renamed).revision, 2);
  assert.equal(active(renamed).reviewedAt, undefined);
  const notebook = {
    ...renamed.notebook,
    questions: [...renamed.notebook.questions, { id: "q2", title: "Risks" }],
  };
  const moved = applyConclusionChanges(renamed, {
    notebook: moveFinding(notebook, active(renamed).id, "q2"),
  });
  assert.equal(active(moved).questionId, "q2");
  assert.equal(active(moved).revision, 3);
  assert.equal(moved.comparison.cells[0].findingId, active(p).id);
  assert.ok(validConclusionLinks(moved));
});

test("archives retain linked identity and freeze comparison edits until restored", () => {
  const p = connectComparisonFindings(fixture());
  const id = active(p).id;
  const archived = applyConclusionChanges(p, {
    notebook: archiveFinding(p.notebook, id),
  });
  assert.equal(archived.notebook.findings.length, 0);
  assert.equal(getLinkedFinding(archived, archived.comparison.cells[0]).id, id);
  assert.ok(isLinkedFindingArchived(archived, archived.comparison.cells[0]));
  assert.equal(active(archived).revision, 1);
  const before = structuredClone(archived);
  assert.throws(
    () => changeCell(archived, { value: "A silent archive rewrite" }),
    /archived/,
  );
  assert.deepEqual(archived, before);
  const restored = applyConclusionChanges(archived, {
    notebook: restoreNotebookItem(
      archived.notebook,
      archived.notebook.archived[0].id,
    ),
  });
  assert.equal(active(restored).id, id);
  assert.equal(active(restored).reviewedAt, undefined);
  assert.equal(active(restored).revision, 2);
  assert.equal(
    isLinkedFindingArchived(restored, restored.comparison.cells[0]),
    false,
  );
  assert.ok(validConclusionLinks(restored));
});

test("archived questions block automatic new cells without modifying existing data", () => {
  const p = connectComparisonFindings(fixture());
  const archived = applyConclusionChanges(p, {
    notebook: archiveQuestion(p.notebook, "criterion"),
  });
  const before = structuredClone(archived);
  const comparison = {
    ...archived.comparison,
    options: [
      ...archived.comparison.options,
      { id: "other", name: "Other", sourceIds: ["source"] },
    ],
    cells: [
      ...archived.comparison.cells,
      {
        ...archived.comparison.cells[0],
        findingId: undefined,
        optionId: "other",
      },
    ],
  };
  assert.throws(
    () => applyConclusionChanges(archived, { comparison }),
    /archived research question/,
  );
  assert.deepEqual(archived, before);
});

test("deleting comparison options retains the original finding and note", () => {
  const p = changeFinding(connectComparisonFindings(fixture()), {
    note: "Keep this research",
  });
  const next = applyConclusionChanges(p, {
    comparison: { ...p.comparison, options: [], cells: [] },
  });
  assert.deepEqual(next.notebook, p.notebook);
  assert.ok(validConclusionLinks(next));
});

test("finding and question capacity failures are atomic", () => {
  for (const count of ["findings", "questions"]) {
    const p = fixture(true);
    p.notebook.questions = Array.from(
      { length: count === "questions" ? 30 : 1 },
      (_, i) => ({ id: `own-${i}`, title: `Question ${i}` }),
    );
    p.notebook.findings =
      count === "findings"
        ? Array.from({ length: 200 }, (_, i) => ({
            id: `own-f-${i}`,
            questionId: "own-0",
            value: "My finding",
            kind: "unknown",
            evidence: [],
            note: "",
          }))
        : [];
    const before = structuredClone(p);
    assert.throws(
      () => connectComparisonFindings(p),
      /exceed 30 questions or 200/,
    );
    assert.deepEqual(p, before);
  }
});

test("conflicting simultaneous edits reject atomically; matching edits increment only once", () => {
  const p = connectComparisonFindings(fixture());
  const before = structuredClone(p);
  const notebook = {
    ...p.notebook,
    findings: p.notebook.findings.map((f) => ({
      ...f,
      value: "Notebook conclusion",
    })),
  };
  const comparison = {
    ...p.comparison,
    cells: p.comparison.cells.map((c) => ({
      ...c,
      value: "Comparison conclusion",
    })),
  };
  assert.throws(
    () => applyConclusionChanges(p, { notebook, comparison }),
    /conflicting edits/,
  );
  assert.deepEqual(p, before);
  comparison.cells[0].value = "Notebook conclusion";
  const same = applyConclusionChanges(p, { notebook, comparison });
  assert.equal(active(same).revision, 2);
  assert.equal(active(same).reviewedAt, undefined);
});

test("backup link validation rejects dangling, inconsistent, duplicate and invalid revisions", () => {
  const p = connectComparisonFindings(fixture());
  assert.equal(validConclusionLinks(p), true);
  for (const mutate of [
    (x) => (x.comparison.cells[0].findingId = "absent"),
    (x) => delete x.comparison.cells[0].findingId,
    (x) => (x.comparison.cells[0].value = "Diverged mirror"),
    (x) =>
      x.comparison.cells.push({
        ...x.comparison.cells[0],
        optionId: "different",
      }),
    (x) => (x.notebook.findings[0].revision = 0),
    (x) => (x.notebook.findings[0].revision = 1.5),
    (x) => (x.comparison.findingsLinked = "yes"),
  ]) {
    const bad = structuredClone(p);
    mutate(bad);
    assert.equal(validConclusionLinks(bad), false);
  }
  delete p.notebook.findings[0].revision;
  assert.equal(validConclusionLinks(p), true);
  const reordered = Object.fromEntries(
    Object.entries(p.comparison.cells[0].evidence[0]).reverse(),
  );
  p.comparison.cells[0].evidence[0] = reordered;
  assert.equal(validConclusionLinks(p), true);
});

test("unrelated project patches preserve research object references", () => {
  const p = connectComparisonFindings(fixture());
  const next = applyConclusionChanges(p, {
    description: "Updated description",
  });
  assert.equal(next.notebook, p.notebook);
  assert.equal(next.comparison, p.comparison);
});
