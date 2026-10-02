import {
  uid,
  type Notebook,
  type NotebookArchiveItem,
  type Finding,
  type Evidence,
  type Project,
} from "./model.ts";
import { notebookFor, notebookLimits, validNotebook } from "./notebook.ts";
import { evidenceExists } from "./research.ts";

export function reorderQuestion(
  notebook: Notebook,
  id: string,
  direction: -1 | 1,
): Notebook {
  const questions = [...notebook.questions];
  const index = questions.findIndex((q) => q.id === id);
  if (
    index < 0 ||
    index + direction < 0 ||
    index + direction >= questions.length
  )
    return notebook;
  [questions[index], questions[index + direction]] = [
    questions[index + direction],
    questions[index],
  ];
  return { ...notebook, questions };
}
export function reorderFinding(
  notebook: Notebook,
  id: string,
  direction: -1 | 1,
): Notebook {
  const finding = notebook.findings.find((f) => f.id === id);
  if (!finding) return notebook;
  const siblings = notebook.findings.filter(
    (f) => f.questionId === finding.questionId,
  );
  const sibling = siblings[siblings.indexOf(finding) + direction];
  if (!sibling) return notebook;
  const findings = [...notebook.findings],
    a = findings.indexOf(finding),
    b = findings.indexOf(sibling);
  [findings[a], findings[b]] = [findings[b], findings[a]];
  return { ...notebook, findings };
}
export function moveFinding(
  notebook: Notebook,
  id: string,
  questionId: string,
): Notebook {
  const finding = notebook.findings.find((f) => f.id === id);
  if (!finding || !notebook.questions.some((q) => q.id === questionId))
    throw new Error(
      "找不到发现或目标问题 / Finding or destination question no longer exists.",
    );
  if (finding.questionId === questionId) return notebook;
  return {
    ...notebook,
    findings: [
      ...notebook.findings.filter((f) => f.id !== id),
      { ...finding, questionId, reviewedAt: undefined },
    ],
  };
}
function archived(
  notebook: Notebook,
  entry: NotebookArchiveItem,
): NotebookArchiveItem[] {
  const next = [entry, ...(notebook.archived || [])];
  if (
    next.length > 200 ||
    next.reduce((n, item) => n + item.findings.length, 0) > 200
  )
    throw new Error(
      "归档最多保留 200 条发现，请先恢复并整理，或备份后使用新项目 / Archive holds up to 200 findings. Restore and organize entries, or back up and continue in a new project.",
    );
  return next;
}
export function archiveFinding(notebook: Notebook, id: string): Notebook {
  const finding = notebook.findings.find((f) => f.id === id);
  const question = notebook.questions.find((q) => q.id === finding?.questionId);
  if (!finding || !question) return notebook;
  const entry: NotebookArchiveItem = {
    id: uid(),
    kind: "finding",
    archivedAt: new Date().toISOString(),
    question: { ...question },
    findings: [structuredClone(finding)],
  };
  return {
    ...notebook,
    findings: notebook.findings.filter((f) => f.id !== id),
    archived: archived(notebook, entry),
  };
}
export function archiveQuestion(notebook: Notebook, id: string): Notebook {
  const question = notebook.questions.find((q) => q.id === id);
  if (!question) return notebook;
  const entry: NotebookArchiveItem = {
    id: uid(),
    kind: "question",
    archivedAt: new Date().toISOString(),
    question: { ...question },
    findings: structuredClone(
      notebook.findings.filter((f) => f.questionId === id),
    ),
  };
  return {
    ...notebook,
    questions: notebook.questions.filter((q) => q.id !== id),
    findings: notebook.findings.filter((f) => f.questionId !== id),
    archived: archived(notebook, entry),
  };
}
export function restoreNotebookItem(
  notebook: Notebook,
  id: string,
  targetQuestionId?: string,
): Notebook {
  const entry = notebook.archived?.find((item) => item.id === id);
  if (!entry) return notebook;
  if (
    notebook.findings.length + entry.findings.length >
    notebookLimits.findings
  )
    throw new Error(
      "恢复后会超过 200 条发现，请先整理当前研究 / Restore would exceed 200 active findings. Organize the current research first.",
    );
  let questions = notebook.questions;
  let questionId = targetQuestionId || entry.question.id;
  if (entry.kind === "question") {
    if (
      questions.length >= notebookLimits.questions ||
      questions.some((q) => q.id === entry.question.id)
    )
      throw new Error(
        "无法恢复此问题，请检查问题数量或重复标识 / Cannot restore this question: limit or duplicate identifier.",
      );
    questions = [...questions, { ...entry.question }];
    questionId = entry.question.id;
  } else if (!questions.some((q) => q.id === questionId))
    throw new Error(
      "先恢复原问题，或选择另一个问题 / Restore the original question first, or choose another question.",
    );
  if (
    entry.findings.some((f) =>
      notebook.findings.some((existing) => existing.id === f.id),
    )
  )
    throw new Error("此发现已经存在 / Finding already exists.");
  return {
    ...notebook,
    questions,
    findings: [
      ...notebook.findings,
      ...entry.findings.map((f) => ({
        ...structuredClone(f),
        questionId,
        reviewedAt: undefined,
      })),
    ],
    archived: notebook.archived!.filter((item) => item.id !== id),
  };
}
export function captureFinding(
  project: Project,
  input: {
    evidence: Evidence;
    questionId?: string;
    newQuestion?: string;
    value: string;
    note: string;
    kind: Finding["kind"];
  },
): { notebook: Notebook; finding: Finding } {
  const notebook = notebookFor(project);
  if (
    !input.evidence.quote.trim() ||
    input.evidence.quote.length > 10000 ||
    !evidenceExists(input.evidence, project)
  )
    throw new Error(
      "摘录必须是原页中连续的文字，最多 10,000 字 / Keep an exact continuous passage from the original page, up to 10,000 characters.",
    );
  if (
    !input.value.trim() ||
    input.value.trim().length > 10000 ||
    input.note.length > 10000 ||
    !["fact", "judgment", "unknown"].includes(input.kind)
  )
    throw new Error(
      "请填写有效发现，最多 10,000 字 / Enter a finding of up to 10,000 characters.",
    );
  if (notebook.findings.length >= notebookLimits.findings)
    throw new Error(
      "最多 200 条发现，请先归档不再使用的内容 / Up to 200 active findings. Archive unused items first.",
    );
  let questions = notebook.questions;
  let question = questions.find((q) => q.id === input.questionId);
  if (input.newQuestion !== undefined) {
    const title = input.newQuestion.trim();
    if (
      !title ||
      title.length > 200 ||
      questions.length >= notebookLimits.questions
    )
      throw new Error(
        "请填写问题名称（最多 200 字），每个项目最多 30 个问题 / Enter a question up to 200 characters. Maximum 30 active questions per project.",
      );
    question = { id: uid(), title };
    questions = [...questions, question];
  }
  if (!question)
    throw new Error("请选择研究问题 / Choose a research question.");
  if (
    notebook.findings.some(
      (f) =>
        f.questionId === question!.id &&
        f.value.trim() === input.value.trim() &&
        f.evidence.some(
          (e) =>
            e.sourceId === input.evidence.sourceId &&
            e.versionId === input.evidence.versionId &&
            e.page === input.evidence.page &&
            e.quote === input.evidence.quote,
        ),
    )
  )
    throw new Error(
      "此问题中已保存相同的发现 / This finding is already saved under this question.",
    );
  const finding: Finding = {
    id: uid(),
    questionId: question.id,
    value: input.value.trim(),
    kind: input.kind,
    note: input.note.trim(),
    evidence: [{ ...input.evidence, id: uid() }],
  };
  const next = {
    ...notebook,
    questions,
    findings: [...notebook.findings, finding],
  };
  if (!validNotebook(next))
    throw new Error(
      "发现或出处信息无效，请检查后重试 / Finding or source details are invalid. Check them and retry.",
    );
  return { notebook: next, finding };
}
