import { useState, useRef } from "react";
import { BookmarkPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type {
  Project,
  Language,
  Evidence,
  Notebook,
  Finding,
} from "@/lib/folio/model";
import { notebookFor } from "@/lib/folio/notebook";
import { captureFinding } from "@/lib/folio/notebook-actions";
import { evidenceExists } from "@/lib/folio/research";

export default function CaptureFinding({
  project,
  language,
  evidence,
  initialQuestionId,
  onClose,
  onSave,
}: {
  project: Project;
  language: Language;
  evidence: Evidence;
  initialQuestionId: string;
  onClose: () => void;
  onSave: (notebook: Notebook, finding: Finding, open: boolean) => void;
}) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const notebook = notebookFor(project);
  const [questionId, setQuestionId] = useState(
    notebook.questions.some((q) => q.id === initialQuestionId)
      ? initialQuestionId
      : notebook.questions[0]?.id || "new",
  );
  const [newQuestion, setNewQuestion] = useState("");
  const [quote, setQuote] = useState(evidence.quote);
  const [value, setValue] = useState(
    evidence.quote.length <= 10000 ? evidence.quote : "",
  );
  const [kind, setKind] = useState<Finding["kind"]>("fact");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const returnFocus = useRef(document.activeElement as HTMLElement | null);
  const openingFinding = useRef(false);
  const valid =
    quote.length <= 10000 &&
    !!quote.trim() &&
    evidenceExists({ ...evidence, quote }, project);
  const save = (open: boolean) => {
    try {
      const result = captureFinding(project, {
        evidence: { ...evidence, quote },
        questionId: questionId === "new" ? undefined : questionId,
        newQuestion: questionId === "new" ? newQuestion : undefined,
        value,
        kind,
        note,
      });
      openingFinding.current = open;
      onSave(result.notebook, result.finding, open);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t("保存失败", "Could not save finding"),
      );
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="folio-dialog capture-dialog"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (!openingFinding.current && returnFocus.current?.isConnected)
            returnFocus.current.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t("保存为研究发现", "Keep as a finding")}</DialogTitle>
          <DialogDescription>
            {t(
              "保留原文出处，把自己的表述放到合适的问题下。",
              "Keep the original passage and place your finding under the right question.",
            )}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save(false);
          }}
          className="capture-form"
        >
          <div className="capture-source">
            <BookmarkPlus size={17} />
            <span>
              {evidence.name} · {t("第", "p.")} {evidence.page} {t("页", "")}
            </span>
          </div>
          <label>
            {t("原文摘录", "Exact passage")}
            <textarea
              rows={3}
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
              aria-invalid={!valid}
            />
          </label>
          <p className={valid ? "capture-hint" : "capture-warning"}>
            {valid
              ? t(
                  "可缩短为原页中的连续文字；出处和版本将一并保存。",
                  "You can shorten this to a continuous passage from the page. Its source revision is kept.",
                )
              : t(
                  "请保留原页中的连续文字，且不超过 10,000 字。",
                  "Keep an exact continuous passage from the page, up to 10,000 characters.",
                )}
          </p>
          <div className="capture-fields">
            <label>
              {t("放入研究问题", "Research question")}
              <select
                value={questionId}
                onChange={(e) => setQuestionId(e.target.value)}
              >
                {notebook.questions.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.title}
                  </option>
                ))}
                <option value="new">{t("新建问题…", "New question…")}</option>
              </select>
            </label>
            <label>
              {t("发现类型", "Finding type")}
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as Finding["kind"])}
              >
                <option value="fact">{t("事实记录", "Recorded fact")}</option>
                <option value="judgment">
                  {t("个人判断", "Personal judgment")}
                </option>
                <option value="unknown">{t("待确认", "To confirm")}</option>
              </select>
            </label>
          </div>
          {questionId === "new" && (
            <label>
              {t("新问题名称", "New question title")}
              <input
                value={newQuestion}
                maxLength={200}
                onChange={(e) => setNewQuestion(e.target.value)}
              />
            </label>
          )}
          <label>
            {t("你的发现", "Your finding")}
            <textarea
              rows={3}
              value={value}
              maxLength={10000}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
          <label>
            {t("个人备注（选填）", "Personal note (optional)")}
            <textarea
              rows={2}
              value={note}
              maxLength={10000}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <p className="capture-hint">
            {t(
              "保存后仍为未核对，不会自动写入简报。",
              "Saved as not reviewed. Your brief is not changed.",
            )}
          </p>
          {error && (
            <p role="alert" className="capture-warning">
              {error}
            </p>
          )}
          <div className="capture-actions">
            <button type="button" className="quiet-link" onClick={onClose}>
              {t("取消", "Cancel")}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={
                !valid ||
                !value.trim() ||
                (questionId === "new" && !newQuestion.trim())
              }
              onClick={() => save(true)}
            >
              {t("保存并查看", "Save & open")}
            </button>
            <button
              className="primary-button"
              disabled={
                !valid ||
                !value.trim() ||
                (questionId === "new" && !newQuestion.trim())
              }
            >
              {t("保存并继续阅读", "Save & keep reading")}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
