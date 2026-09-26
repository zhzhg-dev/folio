import { ArrowUpRight, Check, ChevronDown } from "lucide-react";
import { citations, type Project, type Language } from "@/lib/folio/model";
import { evidenceExists } from "@/lib/folio/research";

export default function ProjectGuide({
  project,
  language,
  onImport,
  onView,
  onBackup,
  backingUp,
}: {
  project: Project;
  language: Language;
  onImport: () => void;
  onView: (view: string) => void;
  onBackup: () => void;
  backingUp: boolean;
}) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const turns = project.research?.turns || [];
  const steps = [
    {
      title: t("收集", "Collect"),
      copy: t(
        "导入 PDF，或粘贴一段资料。",
        "Import a PDF, or paste a useful note.",
      ),
      done: project.sources.length > 0,
      action: onImport,
    },
    {
      title: t("提问", "Ask"),
      copy: t(
        "先查找原文，无需下载模型。",
        "Find passages. No model download needed.",
      ),
      done: turns.some((t) => t.evidence.length),
      action: () => onView("research"),
    },
    {
      title: t("核对", "Review"),
      copy: t(
        "打开证据清单，逐条核对出处。",
        "Open the evidence ledger and check a passage.",
      ),
      done: turns.some((t) =>
        t.evidence.some(
          (e) =>
            t.reviewedEvidenceIds?.includes(e.id) && evidenceExists(e, project),
        ),
      ),
      action: () => onView("research"),
    },
    {
      title: t("写作", "Write"),
      copy: t(
        "选择研究段落，连同引用写入正文。",
        "Add a research passage with its citation.",
      ),
      done: citations(project.content).length > 0,
      action: () => onView("editor"),
    },
  ];
  return (
    <details
      className="project-guide"
      key={project.id}
      open={!project.sources.length || undefined}
    >
      <summary>
        <span>{t("项目指南", "Your workflow")}</span>
        <span>
          {steps.filter((s) => s.done).length}/4
          <ChevronDown size={13} />
        </span>
      </summary>
      <div className="guide-steps">
        {steps.map((s, i) => (
          <button key={i} onClick={s.action}>
            <span className={`guide-number ${s.done ? "is-done" : ""}`}>
              {s.done ? <Check size={13} /> : `0${i + 1}`}
            </span>
            <span>
              <strong>
                {s.title}
                <ArrowUpRight size={12} />
              </strong>
              <small>{s.copy}</small>
            </span>
          </button>
        ))}
      </div>
      <div className="guide-backup">
        <p>
          {t(
            "自动保存只在此浏览器内。备份可带走原文件、正文和研究记录。",
            "Autosave stays in this browser. A backup takes your originals, writing and research history with you.",
          )}
        </p>
        <button className="text-action" disabled={backingUp} onClick={onBackup}>
          {backingUp
            ? t("正在准备…", "Preparing…")
            : t("下载项目备份", "Download backup")}
        </button>
      </div>
    </details>
  );
}
