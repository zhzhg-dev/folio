import {
  uid,
  type ComparisonCell,
  type Finding,
  type Notebook,
  type Project,
} from "./model.ts";
import {
  findingStatus,
  notebookFor,
  notebookLimits,
  validNotebook,
} from "./notebook.ts";

type FindingLocation = {
  finding: Finding;
  archived: boolean;
  question: { id: string; title: string } | undefined;
};
const address = (cell: ComparisonCell) =>
  JSON.stringify([cell.optionId, cell.criterionId]);
const shared = (finding: Finding | ComparisonCell) => ({
  value: finding.value,
  kind: finding.kind,
  evidence: finding.evidence,
  reviewedAt: finding.reviewedAt,
});
const sharedSignature = (finding: Finding | ComparisonCell) =>
  JSON.stringify([
    finding.value,
    finding.kind,
    finding.evidence.map((e) => [
      e.id,
      e.sourceId,
      e.versionId,
      e.page,
      e.quote,
      e.name,
      e.label,
    ]),
    finding.reviewedAt,
  ]);
const revision = (finding: Finding) => finding.revision ?? 1;
const validRevision = (finding: Finding) =>
  finding.revision === undefined ||
  (Number.isSafeInteger(finding.revision) && finding.revision > 0);
const semanticSignature = (location: FindingLocation) =>
  JSON.stringify([
    location.finding.value,
    location.finding.kind,
    location.finding.note,
    location.finding.questionId,
    location.question?.title,
    location.finding.evidence.map((e) => [
      e.sourceId,
      e.versionId,
      e.page,
      e.quote,
    ]),
  ]);
const canonicalSignature = (location: FindingLocation) =>
  JSON.stringify([
    sharedSignature(location.finding),
    location.finding.note,
    location.finding.questionId,
    location.question?.title,
  ]);

function locations(notebook?: Notebook): Map<string, FindingLocation> {
  const result = new Map<string, FindingLocation>();
  const add = (location: FindingLocation) => {
    if (result.has(location.finding.id))
      throw new Error("发现标识重复 / Duplicate finding identifier.");
    result.set(location.finding.id, location);
  };
  notebook?.findings.forEach((finding) =>
    add({
      finding,
      archived: false,
      question: notebook.questions.find((q) => q.id === finding.questionId),
    }),
  );
  notebook?.archived?.forEach((entry) =>
    entry.findings.forEach((finding) =>
      add({ finding, archived: true, question: entry.question }),
    ),
  );
  return result;
}

/** Includes archived findings so an archive never turns a live link into an orphan. */
export function getLinkedFinding(
  project: Project,
  cell: ComparisonCell,
): Finding | undefined {
  if (!cell.findingId) return undefined;
  return locations(project.notebook).get(cell.findingId)?.finding;
}

export function isLinkedFindingArchived(
  project: Project,
  cell: ComparisonCell,
): boolean {
  return (
    !!cell.findingId &&
    locations(project.notebook).get(cell.findingId)?.archived === true
  );
}

/** Strict validation for backup restore: never repair conflicting mirrors by guessing. */
export function validConclusionLinks(project: Project): boolean {
  try {
    const byId = locations(project.notebook);
    if ([...byId.values()].some((item) => !validRevision(item.finding)))
      return false;
    if (
      project.comparison?.findingsLinked !== undefined &&
      typeof project.comparison.findingsLinked !== "boolean"
    )
      return false;
    const linked = new Set<string>();
    for (const cell of project.comparison?.cells || []) {
      if (cell.findingId === undefined) {
        if (
          project.comparison?.findingsLinked &&
          (cell.value.trim() || cell.evidence.length)
        )
          return false;
        continue;
      }
      if (
        typeof cell.findingId !== "string" ||
        !cell.findingId.trim() ||
        cell.findingId.length > 500 ||
        linked.has(cell.findingId)
      )
        return false;
      const finding = byId.get(cell.findingId)?.finding;
      if (!finding || sharedSignature(finding) !== sharedSignature(cell))
        return false;
      linked.add(cell.findingId);
    }
    return true;
  } catch {
    return false;
  }
}

function comparisonContext(project: Project, cell: ComparisonCell): string {
  return JSON.stringify([
    project.comparison?.options.find((o) => o.id === cell.optionId)?.name,
    project.comparison?.criteria.find((c) => c.id === cell.criterionId)?.name,
  ]);
}

function replaceFindings(
  notebook: Notebook,
  replacements: Map<string, Finding>,
): Notebook {
  return {
    ...notebook,
    findings: notebook.findings.map((f) => replacements.get(f.id) || f),
    ...(notebook.archived === undefined
      ? {}
      : {
          archived: notebook.archived.map((entry) => ({
            ...entry,
            findings: entry.findings.map((f) => replacements.get(f.id) || f),
          })),
        }),
  };
}

// Explicit connection is the only migration from an independent comparison.
// A legacy projection has mechanically derived IDs and can retain those IDs;
// an existing notebook's own findings are never matched by wording or evidence.
function connectMissing(project: Project): Project {
  const comparison = project.comparison;
  if (!comparison) return project;
  const pending = comparison.cells.filter(
    (cell) => !cell.findingId && (cell.value.trim() || cell.evidence.length),
  );
  if (!pending.length) return project;
  const legacyProjection = !project.notebook;
  let notebook = project.notebook || notebookFor(project);
  let questions = notebook.questions.map((q) =>
    legacyProjection && !q.title.trim()
      ? { ...q, title: "Comparison criterion" }
      : q,
  );
  let findings = [...notebook.findings];
  const links = new Map<string, string>();
  for (const cell of pending) {
    const legacyId = address(cell);
    const projected = legacyProjection
      ? findings.find((f) => f.id === legacyId)
      : undefined;
    if (projected) {
      const id = projected.id.length <= 500 ? projected.id : uid();
      if (id !== projected.id)
        findings = findings.map((f) => (f === projected ? { ...f, id } : f));
      links.set(address(cell), id);
      continue;
    }
    if (!questions.some((q) => q.id === cell.criterionId)) {
      if (
        notebook.archived?.some(
          (entry) =>
            entry.kind === "question" && entry.question.id === cell.criterionId,
        )
      )
        throw new Error(
          "对应研究问题已归档，请先恢复 / Restore the archived research question before adding a linked finding.",
        );
      const criterion = comparison.criteria.find(
        (c) => c.id === cell.criterionId,
      );
      if (!criterion)
        throw new Error(
          "比较维度不存在 / Comparison criterion no longer exists.",
        );
      questions.push({
        id: criterion.id,
        title: criterion.name.trim() || "Comparison criterion",
      });
    }
    const finding: Finding = {
      id: legacyProjection && legacyId.length <= 500 ? legacyId : uid(),
      questionId: cell.criterionId,
      revision: 1,
      ...structuredClone(shared(cell)),
      note: "",
    };
    findings.push(finding);
    links.set(address(cell), finding.id);
  }
  if (
    questions.length > notebookLimits.questions ||
    findings.length > notebookLimits.findings
  )
    throw new Error(
      "关联后会超过 30 个问题或 200 条活跃发现，请先整理研究 / Linking would exceed 30 questions or 200 active findings. Organize research first.",
    );
  notebook = { ...notebook, questions, findings };
  return {
    ...project,
    notebook,
    comparison: {
      ...comparison,
      cells: comparison.cells.map((cell) => {
        const findingId = links.get(address(cell));
        return findingId ? { ...cell, findingId } : cell;
      }),
    },
  };
}

export function connectComparisonFindings(project: Project): Project {
  if (!project.comparison) return project;
  const connected = connectMissing({
    ...project,
    comparison: { ...project.comparison, findingsLinked: true },
  });
  return applyConclusionChanges(project, {
    comparison: connected.comparison,
    ...(connected.notebook === undefined
      ? {}
      : { notebook: connected.notebook }),
  });
}

/** All notebook/comparison edits commit as one immutable Project update. */
export function applyConclusionChanges(
  project: Project,
  changes: Partial<Project>,
): Project {
  if (
    !Object.hasOwn(changes, "notebook") &&
    !Object.hasOwn(changes, "comparison")
  )
    return { ...project, ...changes };
  let next: Project = { ...project, ...changes };
  const oldCells = new Map(
    project.comparison?.cells.map((cell) => [address(cell), cell]) || [],
  );
  if (next.comparison) {
    next = {
      ...next,
      comparison: {
        ...next.comparison,
        cells: next.comparison.cells.map((cell) => {
          const old = oldCells.get(address(cell));
          return old?.findingId && !Object.hasOwn(cell, "findingId")
            ? { ...cell, findingId: old.findingId }
            : cell;
        }),
      },
    };
  }
  if (next.comparison?.findingsLinked) next = connectMissing(next);
  const before = locations(project.notebook);
  const incoming = locations(next.notebook);
  const contextChanged = new Set<string>();
  const linkedIds = new Set<string>();
  for (const cell of next.comparison?.cells || []) {
    if (!cell.findingId) continue;
    const target = incoming.get(cell.findingId);
    if (!target || linkedIds.has(cell.findingId))
      throw new Error(
        "结论关联无效或重复 / Invalid or duplicate conclusion link.",
      );
    linkedIds.add(cell.findingId);
    const oldCell = oldCells.get(address(cell));
    const existingLink = oldCell?.findingId === cell.findingId;
    if (!existingLink) {
      if (sharedSignature(cell) !== sharedSignature(target.finding))
        throw new Error(
          "比较与发现内容冲突，无法自动关联 / Comparison and finding conflict. They cannot be linked automatically.",
        );
      continue;
    }
    const cellChanged = sharedSignature(cell) !== sharedSignature(oldCell!);
    const renamed =
      comparisonContext(project, oldCell!) !== comparisonContext(next, cell);
    if ((cellChanged || renamed) && target.archived)
      throw new Error(
        "关联发现已归档，请先恢复再编辑比较 / This linked finding is archived. Restore it before editing the comparison.",
      );
    if (renamed) contextChanged.add(cell.findingId);
    if (!cellChanged) continue;
    const oldFinding = before.get(cell.findingId)?.finding;
    const findingChanged =
      !!oldFinding &&
      sharedSignature(target.finding) !== sharedSignature(oldFinding);
    if (
      findingChanged &&
      sharedSignature(target.finding) !== sharedSignature(cell)
    )
      throw new Error(
        "发现与比较同时发生不同修改，请分别保存 / The finding and comparison have conflicting edits. Save them separately.",
      );
    incoming.set(cell.findingId, {
      ...target,
      finding: { ...target.finding, ...structuredClone(shared(cell)) },
    });
  }
  const replacements = new Map<string, Finding>();
  for (const [id, location] of incoming) {
    const old = before.get(id);
    if (
      !validRevision(location.finding) ||
      (old && !validRevision(old.finding))
    )
      throw new Error("结论修订号无效 / Invalid conclusion revision.");
    if (!old) {
      replacements.set(id, { ...location.finding, revision: 1 });
      continue;
    }
    const movedContext =
      contextChanged.has(id) ||
      location.finding.questionId !== old.finding.questionId ||
      location.question?.title !== old.question?.title;
    const semanticChanged =
      movedContext || semanticSignature(location) !== semanticSignature(old);
    // Editors clear review when text changes, then record a new timestamp only
    // when the user explicitly checks the revised claim. Preserve that action,
    // but never carry an old review across semantic or surrounding-context edits.
    const incomingReview = location.finding.reviewedAt;
    const explicitReview =
      typeof incomingReview === "string" &&
      incomingReview !== old.finding.reviewedAt &&
      Number.isFinite(Date.parse(incomingReview));
    const canReview =
      findingStatus({ ...location.finding, reviewedAt: undefined }, next) ===
      "unreviewed";
    const reviewedAt =
      movedContext ||
      (semanticChanged && !(explicitReview && canReview)) ||
      (explicitReview && !canReview)
        ? undefined
        : incomingReview;
    const normalized = {
      ...location,
      finding: { ...location.finding, reviewedAt },
    };
    const changed =
      semanticChanged ||
      canonicalSignature(normalized) !== canonicalSignature(old);
    if (old.archived && location.archived && changed)
      throw new Error(
        "归档发现不可直接修改，请先恢复 / Restore an archived finding before changing it.",
      );
    if (changed && revision(old.finding) === Number.MAX_SAFE_INTEGER)
      throw new Error(
        "结论修订号已达上限 / Conclusion revision limit reached.",
      );
    replacements.set(id, {
      ...location.finding,
      reviewedAt,
      revision: revision(old.finding) + (changed ? 1 : 0),
    });
  }
  if (next.notebook)
    next = { ...next, notebook: replaceFindings(next.notebook, replacements) };
  if (next.comparison)
    next = {
      ...next,
      comparison: {
        ...next.comparison,
        cells: next.comparison.cells.map((cell) => {
          const finding = cell.findingId
            ? replacements.get(cell.findingId)
            : undefined;
          return finding
            ? { ...cell, ...structuredClone(shared(finding)) }
            : cell;
        }),
      },
    };
  if (next.notebook && !validNotebook(next.notebook))
    throw new Error(
      "研究发现结构或数量无效 / Invalid research finding structure or limits.",
    );
  if (!validConclusionLinks(next))
    throw new Error(
      "结论与比较关联不完整 / Conclusion links are incomplete or inconsistent.",
    );
  return next;
}
