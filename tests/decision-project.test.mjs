import test from "node:test";
import assert from "node:assert/strict";
import { makeProject, para } from "../lib/folio/model.ts";
import { validComparison } from "../lib/folio/comparison.ts";
import { validNotebook } from "../lib/folio/notebook.ts";
import {
  applyConclusionChanges,
  getLinkedFinding,
  validConclusionLinks,
} from "../lib/folio/conclusions.ts";
import {
  buildDecisionProject,
  decisionDefaults,
  validateDecisionSetup,
} from "../lib/folio/decision-project.ts";

function fixture() {
  const project = makeProject("Inbox decision", "en");
  project.sources = ["Harbor", "Relay"].map((name, index) => ({
    id: `source-${index}`,
    name,
    kind: "txt",
    color: "green",
    versions: [
      {
        id: `version-${index}`,
        text: `${name} costs USD 18 per seat.`,
        pages: [{ page: 1, text: `${name} costs USD 18 per seat.` }],
        createdAt: project.createdAt,
        hash: `fixture-${index}`,
        size: 100,
      },
    ],
  }));
  return project;
}
function input() {
  return {
    objective: "Choose a support inbox for five people",
    options: [
      { name: "Harbor", sourceIds: ["source-0"] },
      { name: "Relay", sourceIds: ["source-1"] },
    ],
    criteria: ["Cost", "Data export", "Limitations"],
  };
}

test("defaults use English, real criteria, and blank option names without shared mutable arrays", () => {
  const first = decisionDefaults();
  const second = decisionDefaults();
  assert.deepEqual(first.criteria, [
    "Cost & billing",
    "Fit for our needs",
    "Limits & risks",
  ]);
  assert.equal(first.objective, "");
  assert.equal(first.options.length, 2);
  assert.ok(
    first.options.every(
      (option) => option.name === "" && !option.sourceIds.length,
    ),
  );
  first.options[0].sourceIds.push("changed");
  first.criteria.pop();
  assert.equal(second.options[0].sourceIds.length, 0);
  assert.equal(second.criteria.length, 3);
  assert.deepEqual(decisionDefaults("zh").criteria, [
    "成本与计费",
    "需求匹配",
    "限制与风险",
  ]);
});

test("creates a linked decision with exact source assignments and no invented findings", () => {
  const project = fixture();
  const setup = input();
  setup.objective = `  ${setup.objective}  `;
  setup.options[0].name = "  Harbor   Pro  ";
  setup.criteria[0] = "  Total  cost ";
  const beforeProject = structuredClone(project);
  const beforeInput = structuredClone(setup);
  const next = buildDecisionProject(project, setup);
  assert.deepEqual(project, beforeProject);
  assert.deepEqual(setup, beforeInput);
  assert.equal(next.id, project.id);
  assert.equal(next.lastView, "comparison");
  assert.equal(next.comparison.findingsLinked, true);
  assert.equal(next.comparison.objective, setup.objective.trim());
  assert.deepEqual(
    next.comparison.options.map((option) => option.name),
    ["Harbor Pro", "Relay"],
  );
  assert.deepEqual(
    next.comparison.options.map((option) => option.sourceIds),
    [["source-0"], ["source-1"]],
  );
  assert.equal(next.comparison.criteria[0].name, "Total cost");
  assert.equal(next.comparison.cells.length, 0);
  assert.equal(next.comparison.recommendation, "");
  assert.equal(next.comparison.limitations, "");
  assert.equal(next.notebook, undefined);
  assert.ok(validComparison(next.comparison));
  assert.ok(validConclusionLinks(next));
  next.comparison.options[0].sourceIds.push("source-1");
  assert.deepEqual(setup.options[0].sourceIds, ["source-0"]);
});

test("preserves independent notes, brief, sources, review history and immutable outputs", () => {
  const project = fixture();
  project.notebook = {
    objective: "Existing research",
    questions: [{ id: "q1", title: "Existing question" }],
    findings: [
      {
        id: "finding",
        questionId: "q1",
        value: "Existing judgment",
        note: "Keep this note",
        evidence: [],
        kind: "judgment",
        revision: 7,
      },
    ],
  };
  project.content = {
    type: "doc",
    content: [para("An independently edited brief.")],
  };
  project.snapshots = [
    {
      id: "snapshot",
      title: "Earlier brief",
      reportTitle: "Original",
      content: project.content,
      createdAt: project.createdAt,
    },
  ];
  project.deliveries = [{ id: "delivery", title: "Immutable fixture" }];
  project.reviewHistory = [{ id: "review", title: "Existing audit fixture" }];
  project.research = {
    question: "A saved question",
    selectedSourceIds: ["source-0"],
    mode: "passages",
    turns: [],
  };
  const before = structuredClone(project);
  const next = buildDecisionProject(project, input());
  assert.deepEqual(project, before);
  for (const key of [
    "notebook",
    "content",
    "sources",
    "snapshots",
    "deliveries",
    "reviewHistory",
    "research",
  ])
    assert.equal(next[key], project[key], key);
  assert.equal(next.name, project.name);
  assert.equal(next.reportTitle, project.reportTitle);
  assert.equal(next.createdAt, project.createdAt);
});

test("first saved comparison cell becomes a canonical finding without replacing existing research", () => {
  const project = fixture();
  project.notebook = {
    objective: "Original objective",
    questions: [{ id: "own-q", title: "Own question" }],
    findings: [
      {
        id: "own-f",
        questionId: "own-q",
        value: "An independent note",
        note: "",
        kind: "unknown",
        evidence: [],
      },
    ],
  };
  const built = buildDecisionProject(project, input());
  const source = built.sources[0];
  const version = source.versions[0];
  const cell = {
    optionId: built.comparison.options[0].id,
    criterionId: built.comparison.criteria[0].id,
    value: "Five seats cost USD 90.",
    kind: "judgment",
    evidence: [
      {
        id: "e1",
        sourceId: source.id,
        versionId: version.id,
        page: 1,
        quote: version.text,
        name: source.name,
        label: "1",
      },
    ],
  };
  const next = applyConclusionChanges(built, {
    comparison: { ...built.comparison, cells: [cell] },
  });
  const finding = getLinkedFinding(next, next.comparison.cells[0]);
  assert.equal(finding.questionId, built.comparison.criteria[0].id);
  assert.equal(finding.value, cell.value);
  assert.equal(finding.revision, 1);
  assert.equal(finding.reviewedAt, undefined);
  assert.equal(next.notebook.findings.length, 2);
  assert.equal(next.notebook.findings[0].id, "own-f");
  assert.equal(next.notebook.objective, "Original objective");
  assert.ok(validNotebook(next.notebook));
  assert.ok(validConclusionLinks(next));
});

test("can start without sources and explicitly assign later imports", () => {
  const project = makeProject("Decision", "en");
  const setup = input();
  setup.options.forEach((option) => (option.sourceIds = []));
  const built = buildDecisionProject(project, setup);
  assert.ok(validComparison(built.comparison));
  assert.equal(built.sources.length, 0);
  assert.ok(
    built.comparison.options.every((option) => !option.sourceIds.length),
  );
  const imported = { ...built, sources: fixture().sources };
  const next = applyConclusionChanges(imported, {
    comparison: {
      ...imported.comparison,
      options: imported.comparison.options.map((option, index) => ({
        ...option,
        sourceIds: [`source-${index}`],
      })),
    },
  });
  assert.deepEqual(
    next.comparison.options.map((option) => option.sourceIds),
    [["source-0"], ["source-1"]],
  );
  assert.equal(next.comparison.cells.length, 0);
  assert.ok(validConclusionLinks(next));
});

test("permits a shared source for multiple options while rejecting duplicate assignments within one", () => {
  const setup = input();
  setup.options[1].sourceIds = ["source-0"];
  assert.deepEqual(validateDecisionSetup(fixture(), setup), {});
  setup.options[0].sourceIds.push("source-0");
  assert.ok(validateDecisionSetup(fixture(), setup)["options.0.sourceIds"]);
});

test("rejects overwriting any existing comparison and leaves the project untouched", () => {
  const existing = buildDecisionProject(fixture(), input());
  const before = structuredClone(existing);
  assert.throws(
    () => buildDecisionProject(existing, input()),
    /already has a comparison/,
  );
  assert.deepEqual(existing, before);
  for (const flag of ["archivedAt", "deletedAt"]) {
    const project = fixture();
    project[flag] = project.createdAt;
    assert.throws(
      () => buildDecisionProject(project, input()),
      /Restore this project/,
    );
  }
});

test("normalizes Unicode, case and spacing for duplicate names without silently merging them", () => {
  for (const names of [
    ["Harbor", " harbor "],
    ["Ａ", "A"],
    ["Team  plan", "team plan"],
  ]) {
    const setup = input();
    setup.options.forEach((option, index) => (option.name = names[index]));
    const errors = validateDecisionSetup(fixture(), setup);
    assert.ok(errors["options.0.name"]);
    assert.ok(errors["options.1.name"]);
    assert.throws(
      () => buildDecisionProject(fixture(), setup),
      /different name/,
    );
  }
  const setup = input();
  setup.criteria = ["Cost", " cost "];
  assert.ok(validateDecisionSetup(fixture(), setup)["criteria.1"]);
});

test("enforces option and criterion bounds and rejects incomplete or malformed setup atomically", () => {
  const invalid = [
    (s) => (s.objective = "   "),
    (s) => (s.objective = "x".repeat(1001)),
    (s) => s.options.pop(),
    (s) =>
      (s.options = Array.from({ length: 7 }, (_, i) => ({
        name: `Option ${i}`,
        sourceIds: [],
      }))),
    (s) => (s.options[0].name = "  "),
    (s) => (s.options[0].name = "x".repeat(201)),
    (s) => (s.options[0].sourceIds = ["missing"]),
    (s) => (s.options[0].sourceIds = null),
    (s) => (s.options[0] = null),
    (s) => (s.options = new Array(2)),
    (s) => (s.criteria = []),
    (s) => (s.criteria = new Array(1)),
    (s) =>
      (s.criteria = Array.from({ length: 13 }, (_, i) => `Criterion ${i}`)),
    (s) => (s.criteria[0] = " "),
    (s) => (s.criteria[0] = null),
    (s) => (s.criteria[0] = "x".repeat(201)),
  ];
  for (const mutate of invalid) {
    const project = fixture();
    const before = structuredClone(project);
    const setup = input();
    mutate(setup);
    assert.ok(Object.keys(validateDecisionSetup(project, setup)).length);
    assert.throws(() => buildDecisionProject(project, setup));
    assert.deepEqual(project, before);
  }
  assert.ok(validateDecisionSetup(fixture(), null).form);
  const maximum = input();
  maximum.options = Array.from({ length: 6 }, (_, i) => ({
    name: `Choice ${i}`,
    sourceIds: [],
  }));
  maximum.criteria = Array.from({ length: 12 }, (_, i) => `Criterion ${i}`);
  assert.ok(
    validComparison(buildDecisionProject(fixture(), maximum).comparison),
  );
});

test("Chinese validation is actionable and initial setup creates no notebook capacity pressure", () => {
  const project = fixture();
  const bad = input();
  bad.objective = "";
  assert.match(validateDecisionSetup(project, bad, "zh").objective, /写下/);
  project.notebook = {
    objective: "Keep existing research",
    questions: Array.from({ length: 30 }, (_, i) => ({
      id: `q${i}`,
      title: `Question ${i}`,
    })),
    findings: Array.from({ length: 200 }, (_, i) => ({
      id: `f${i}`,
      questionId: "q0",
      kind: "unknown",
      value: `Finding ${i}`,
      evidence: [],
      note: "",
    })),
  };
  const next = buildDecisionProject(project, input());
  assert.equal(next.notebook, project.notebook);
  assert.equal(next.notebook.questions.length, 30);
  assert.equal(next.notebook.findings.length, 200);
  assert.equal(next.comparison.cells.length, 0);
});
