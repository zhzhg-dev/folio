import {
  uid,
  type Draft,
  type Evidence,
  type Project,
  type ResearchState,
  type ResearchTurn,
} from "./model.ts";
import { contextualQuery, retrieve } from "./retrieval.ts";

export const initialResearch = (project: Project): ResearchState =>
  project.research || {
    question: "",
    selectedSourceIds: project.sources.map((s) => s.id),
    mode: "passages",
    turns: [],
  };
export function evidenceExists(e: Evidence, project: Project) {
  return (
    !!e.quote &&
    !!project.sources
      .find((s) => s.id === e.sourceId)
      ?.versions.find((v) => v.id === e.versionId)
      ?.pages.some((p) => p.page === e.page && p.text.includes(e.quote))
  );
}
export function findPassages(
  project: Project,
  question: string,
  ids: string[],
  previousQuestion?: string,
): ResearchTurn {
  const retrievalQuery = contextualQuery(question, previousQuestion);
  const evidence = retrieve(
    project,
    question,
    ids,
    retrievalQuery !== question ? previousQuestion : undefined,
  );
  return {
    id: uid(),
    question,
    retrievalQuery,
    sourceIds: ids,
    createdAt: new Date().toISOString(),
    mode: "passages",
    status: evidence.length ? "answered" : "insufficient",
    evidence,
    paragraphs: evidence.map((e) => ({ text: e.quote, evidenceIds: [e.id] })),
  };
}
export function parseAnswer(
  raw: string,
  evidence: Evidence[],
): Pick<ResearchTurn, "paragraphs" | "status"> {
  const parsed = JSON.parse(
    raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim(),
  );
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !["answered", "insufficient", "conflicting"].includes(parsed.status) ||
    !Array.isArray(parsed.paragraphs) ||
    parsed.paragraphs.length > 6
  )
    throw new Error(
      "回答格式不完整，请重试 / Incomplete answer. Please try again.",
    );
  if (parsed.status === "insufficient")
    return { status: "insufficient", paragraphs: [] };
  if (!parsed.paragraphs.length)
    throw new Error("回答内容为空 / The answer was empty.");
  for (const p of parsed.paragraphs) {
    if (
      !p ||
      typeof p !== "object" ||
      typeof p.text !== "string" ||
      !p.text.trim() ||
      p.text.length > 4000 ||
      !Array.isArray(p.evidenceIds) ||
      !p.evidenceIds.length ||
      p.evidenceIds.some((id: unknown) => !evidence.some((e) => e.id === id))
    )
      throw new Error(
        "回答缺少有效出处，请重试 / The answer has missing or invalid citations. Try again.",
      );
  }
  if (
    parsed.status === "conflicting" &&
    new Set(
      parsed.paragraphs
        .flatMap((p: { evidenceIds: string[] }) => p.evidenceIds)
        .map((id: unknown) => evidence.find((e) => e.id === id)?.sourceId),
    ).size < 2
  )
    throw new Error(
      "对比回答需要两份资料的出处 / A comparison needs evidence from at least two sources.",
    );
  return {
    status: parsed.status,
    paragraphs: parsed.paragraphs.map(
      (p: { text: string; evidenceIds: string[] }) => ({
        text: p.text.trim(),
        evidenceIds: [...new Set(p.evidenceIds)],
      }),
    ),
  };
}
export function draftNodes(draft: Draft, project: Project) {
  if (
    !draft.paragraphs.length ||
    draft.paragraphs.some(
      (p) =>
        !p.text.trim() ||
        !p.evidenceIds.length ||
        p.evidenceIds.some(
          (id) =>
            !draft.evidence.find(
              (e) => e.id === id && evidenceExists(e, project),
            ),
        ),
    )
  )
    throw new Error("无法核对引用原文 / Could not verify the cited passage.");
  return draft.paragraphs.map((p) => ({
    type: "paragraph",
    content: [
      { type: "text", text: p.text },
      ...p.evidenceIds.map((id) => {
        const e = draft.evidence.find((e) => e.id === id)!;
        return {
          type: "citation",
          attrs: {
            sourceId: e.sourceId,
            versionId: e.versionId,
            quote: e.quote,
            page: e.page,
            label: String(
              project.sources.findIndex((s) => s.id === e.sourceId) + 1,
            ),
          },
        };
      }),
    ],
  }));
}
export function validResearch(value: unknown): value is ResearchState {
  if (!value || typeof value !== "object") return false;
  const r = value as ResearchState;
  const str = (v: unknown, max = 10000) =>
    typeof v === "string" && v.length <= max;
  return (
    str(r.question) &&
    ["passages", "answer"].includes(r.mode) &&
    Array.isArray(r.selectedSourceIds) &&
    r.selectedSourceIds.every((id) => str(id, 200)) &&
    Array.isArray(r.turns) &&
    r.turns.length <= 1000 &&
    r.turns.every(
      (t) =>
        !!t &&
        typeof t === "object" &&
        str(t.id, 200) &&
        str(t.question) &&
        str(t.retrievalQuery) &&
        str(t.createdAt, 100) &&
        ["passages", "answer"].includes(t.mode) &&
        ["answered", "insufficient", "conflicting"].includes(t.status) &&
        Array.isArray(t.sourceIds) &&
        t.sourceIds.every((id) => str(id, 200)) &&
        Array.isArray(t.evidence) &&
        t.evidence.length <= 20 &&
        t.evidence.every(
          (e) =>
            !!e &&
            typeof e === "object" &&
            [e.id, e.sourceId, e.versionId, e.name, e.label].every((v) =>
              str(v, 1000),
            ) &&
            str(e.quote) &&
            Number.isInteger(e.page) &&
            e.page > 0,
        ) &&
        (t.reviewedEvidenceIds === undefined ||
          (Array.isArray(t.reviewedEvidenceIds) &&
            t.reviewedEvidenceIds.length <= t.evidence.length &&
            new Set(t.reviewedEvidenceIds).size ===
              t.reviewedEvidenceIds.length &&
            t.reviewedEvidenceIds.every((id) =>
              t.evidence.some((e) => e.id === id),
            ))) &&
        Array.isArray(t.paragraphs) &&
        t.paragraphs.length <= 20 &&
        t.paragraphs.every(
          (p) =>
            !!p &&
            typeof p === "object" &&
            str(p.text) &&
            Array.isArray(p.evidenceIds) &&
            p.evidenceIds.every((id) => t.evidence.some((e) => e.id === id)),
        ),
    )
  );
}
