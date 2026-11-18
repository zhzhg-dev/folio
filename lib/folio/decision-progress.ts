import { cellStatus } from "./comparison.ts";
import { createDelivery, type Delivery } from "./delivery.ts";
import {
  citationStatus,
  collectCitations,
  stripConclusionLinks,
} from "./integrity.ts";
import { linkedBriefItems } from "./linked-brief.ts";
import { plainText, type Project } from "./model.ts";
import { notebookLimits } from "./notebook.ts";
import type { JSONContent } from "@tiptap/react";

export type DecisionAction =
  | { type: "import"; optionId: string }
  | { type: "organize" }
  | { type: "open-brief" }
  | { type: "attach"; optionId: string }
  | { type: "review-cell"; optionId: string; criterionId: string }
  | { type: "restore-finding"; findingId: string }
  | { type: "restore-question"; questionId: string }
  | { type: "recommend"; field: "recommendation" | "limitations" }
  | { type: "insert-brief" }
  | { type: "update-brief"; blockId: string }
  | { type: "review-brief" }
  | { type: "prepare-edition" }
  | { type: "open-edition"; deliveryId: string };

export type DecisionProgressState =
  | "materials"
  | "capacity"
  | "restore-finding"
  | "restore-question"
  | "changed"
  | "fill-gap"
  | "review"
  | "limitations"
  | "recommendation"
  | "draft"
  | "existing-brief"
  | "brief-update"
  | "brief-citations"
  | "first-edition"
  | "next-edition"
  | "saved-edition";

export type DecisionProgressResult = {
  state: DecisionProgressState;
  action: DecisionAction;
  counts: Record<
    "total" | "reviewed" | "missing" | "changed" | "unreviewed",
    number
  >;
  notedGaps: number;
  target?: string;
};

function comparable(edition: Delivery) {
  const { missing, updated, unreviewed, outdated } = edition.checks;
  return JSON.stringify([
    edition.content,
    edition.references,
    missing,
    updated,
    unreviewed,
    outdated || 0,
  ]);
}

function hasComparisonLink(node: JSONContent): boolean {
  return (
    (node.type === "conclusionBlock" && node.attrs?.origin === "comparison") ||
    !!node.content?.some(hasComparisonLink)
  );
}

function matchingEdition(project: Project, editions: Delivery[]) {
  if (!editions.length) return undefined;
  try {
    // Prepare using the same rules as the recipient view. Preparing is pure
    // with respect to the project; nothing is persisted or sent here.
    const live = comparable(
      // All live links were checked above. The recipient content has no live
      // wrappers, so do not regenerate every comparison/finding candidate again.
      createDelivery(
        { ...project, content: stripConclusionLinks(project.content) },
        "en",
        {
          title: "Current brief",
          summary: "",
          origin: "brief",
          findingIds: [],
          includeNotes: false,
        },
      ),
    );
    // Edition title, summary, language, ID and date are intentional recipient
    // metadata. Only the supported draft content and citation checks must match.
    return editions.find((edition) => comparable(edition) === live);
  } catch {
    // A draft that cannot currently be prepared is not a matching edition.
    return undefined;
  }
}

export function decisionProgress(
  project: Project,
): DecisionProgressResult | null {
  const c = project.comparison;
  if (!c) return null;
  const counts = {
    total: 0,
    reviewed: 0,
    missing: 0,
    changed: 0,
    unreviewed: 0,
  };
  const archivedIds = new Set(
    project.notebook?.archived?.flatMap((entry) =>
      entry.findings.map((f) => f.id),
    ),
  );
  const cells = new Map(
    c.cells.map((cell) => [
      JSON.stringify([cell.optionId, cell.criterionId]),
      cell,
    ]),
  );
  const rows = c.criteria.flatMap((criterion) =>
    c.options.map((option) => {
      const optionId = option.id,
        criterionId = criterion.id;
      const cell = cells.get(JSON.stringify([optionId, criterionId]));
      const status = cellStatus(cell, project);
      counts.total += 1;
      counts[status] += 1;
      return {
        option,
        cell,
        label: `${option.name} / ${criterion.name}`,
        address: { type: "review-cell" as const, optionId, criterionId },
        status,
        notedGap: cell?.kind === "unknown" && !!cell.value.trim(),
      };
    }),
  );
  const notedGaps = rows.filter((row) => row.notedGap).length;
  const step = (
    state: DecisionProgressState,
    action: DecisionAction,
    target?: string,
  ): DecisionProgressResult => ({
    state,
    action,
    counts,
    notedGaps,
    target,
  });

  const archived = rows.find(
    ({ cell }) => cell?.findingId && archivedIds.has(cell.findingId),
  );
  if (archived?.cell?.findingId)
    return step(
      "restore-finding",
      { type: "restore-finding", findingId: archived.cell.findingId },
      archived.label,
    );
  const changed = rows.find((row) => row.status === "changed");
  if (changed) return step("changed", changed.address, changed.label);

  const missing = rows.filter(
    (row) => row.status === "missing" && !row.notedGap,
  );
  const nextMissing = missing[0];
  if (
    nextMissing &&
    c.findingsLinked &&
    !nextMissing.cell?.findingId &&
    project.notebook
  ) {
    const notebook = project.notebook;
    const needsQuestion = !notebook.questions.some(
      (q) => q.id === nextMissing.address.criterionId,
    );
    if (
      needsQuestion &&
      notebook.archived?.some(
        (entry) =>
          entry.kind === "question" &&
          entry.question.id === nextMissing.address.criterionId,
      )
    )
      return step(
        "restore-question",
        {
          type: "restore-question",
          questionId: nextMissing.address.criterionId,
        },
        nextMissing.label,
      );
    if (
      notebook.findings.length >= notebookLimits.findings ||
      (needsQuestion && notebook.questions.length >= notebookLimits.questions)
    )
      return step("capacity", { type: "organize" }, nextMissing.label);
  }
  if (missing.length && !project.sources.length)
    return step("materials", {
      type: "import",
      optionId: missing[0].option.id,
    });
  const sourceIds = new Set(project.sources.map((source) => source.id));
  const unattached = missing.find(
    ({ option }) => !option.sourceIds.some((id) => sourceIds.has(id)),
  );
  if (unattached)
    return step(
      "materials",
      { type: "attach", optionId: unattached.option.id },
      unattached.option.name,
    );
  if (missing[0]) return step("fill-gap", missing[0].address, missing[0].label);
  const unreviewed = rows.find((row) => row.status === "unreviewed");
  if (unreviewed) return step("review", unreviewed.address, unreviewed.label);

  // A documented unknown can be carried into the brief. Require that the
  // remaining limits are made explicit without equating a blank cell with one.
  if (notedGaps && !c.limitations.trim())
    return step("limitations", { type: "recommend", field: "limitations" });
  if (!c.recommendation.trim())
    return step("recommendation", {
      type: "recommend",
      field: "recommendation",
    });

  if (!hasComparisonLink(project.content))
    return plainText(project.content).trim()
      ? step("existing-brief", { type: "open-brief" })
      : step("draft", { type: "insert-brief" });
  const links = linkedBriefItems(project);
  const pendingLink =
    links.find(
      (link) => link.origin === "comparison" && link.status !== "current",
    ) || links.find((link) => link.status !== "current");
  if (pendingLink)
    return step(
      "brief-update",
      { type: "update-brief", blockId: pendingLink.id },
      pendingLink.title,
    );
  if (
    collectCitations(project.content).some(
      (node) => citationStatus(node.attrs || {}, project) !== "current",
    )
  )
    return step("brief-citations", { type: "review-brief" });

  const editions = (project.deliveries || []).filter(
    (d) => d.origin === "brief",
  );
  const saved = matchingEdition(project, editions);
  if (saved)
    return step(
      "saved-edition",
      { type: "open-edition", deliveryId: saved.id },
      saved.title,
    );
  return step(editions.length ? "next-edition" : "first-edition", {
    type: "prepare-edition",
  });
}
