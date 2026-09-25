"use client";
import { useState, useEffect } from "react";
import {
  Sparkles,
  ArrowUpRight,
  Check,
  Square,
  AlertCircle,
  Download,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import type { Project, Language } from "@/lib/folio/model";
import type { Draft } from "@/lib/folio/ai";
import { errorMessage } from "@/lib/folio/i18n";
export default function Assistant({
  project,
  language,
  onAdopt,
}: {
  project: Project;
  language: Language;
  onAdopt: (draft: Draft) => void;
}) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const [status, setStatus] = useState("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [goal, setGoal] = useState("");
  const [selected, setSelected] = useState(project.sources.map((s) => s.id));
  const [draft, setDraft] = useState<Draft | null>(null);
  useEffect(() => {
    setSelected(project.sources.map((s) => s.id));
    setDraft(null);
  }, [project.id, project.sources.length]);
  const enable = async () => {
    setStatus("loading");
    setError("");
    try {
      const ai = await import("@/lib/folio/ai");
      await ai.loadModel((p, m) => {
        setProgress(p * 100);
        setMessage(m);
      });
      setStatus("ready");
      toast.success(t("本地 AI 已就绪", "Local AI is ready"));
    } catch (e) {
      setStatus("idle");
      setError(errorMessage(e, language));
    }
  };
  const generate = async () => {
    setStatus("generating");
    setError("");
    setDraft(null);
    try {
      const ai = await import("@/lib/folio/ai");
      const output = await ai.generateDraft(
        project,
        goal ||
          t(
            "整理资料中的核心观点，写出简短的研究概述。",
            "Write a short research summary of the main ideas.",
          ),
        selected,
        language,
      );
      setDraft(output);
    } catch (e) {
      setError(errorMessage(e, language));
    } finally {
      setStatus("ready");
    }
  };
  return (
    <div className="assistant-panel">
      <span className="assistant-symbol">
        <Sparkles size={22} />
      </span>
      <h3>{t("给思路一点空间", "Make space for an idea")}</h3>
      <p>
        {t(
          "从资料出发，写出自己的观点。建议会先留在这里，等你决定。",
          "Start with your sources. Suggestions stay here until you choose to use them.",
        )}
      </p>
      {status === "idle" && (
        <div className="model-onboarding">
          <div className="model-label">
            <ShieldCheck size={14} />
            {t("在设备上运行", "Runs on your device")}
          </div>
          <p className="small-copy">
            {t(
              "首次需下载模型，占用网络和磁盘空间。需要支持 WebGPU 的设备；无需 API Key。",
              "First use downloads model files and uses local storage. Requires WebGPU; no API key.",
            )}
          </p>
          <button className="primary-button" onClick={enable}>
            <Download size={15} />
            {t("下载并启用 AI", "Download & enable AI")}
          </button>
        </div>
      )}
      {status === "loading" && (
        <div className="model-progress">
          <Loader2 className="spin" size={20} />
          <span>{t("准备本地模型", "Preparing local model")}</span>
          <Progress value={progress} />
          <small>
            {Math.round(progress)}% · {message}
          </small>
        </div>
      )}
      {(status === "ready" || status === "generating") && (
        <>
          <div className="model-label ready">
            <Check size={14} />
            Qwen3 · {t("本地运行", "On device")}
          </div>
          <label className="field-label" htmlFor="writing-goal">
            {t("这次想写什么？", "What are you working on?")}
          </label>
          <textarea
            id="writing-goal"
            className="field-input ai-goal"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder={t(
              "例如：概括独立工作者面临的三个问题…",
              "e.g. Summarize three challenges for independent workers…",
            )}
          />
          <div className="goal-chips">
            {[
              ["整理观点", "Summarize ideas"],
              ["起草一节", "Draft a section"],
              ["对比资料", "Compare sources"],
            ].map(([zh, en]) => (
              <button key={en} onClick={() => setGoal(t(zh, en))}>
                {t(zh, en)}
              </button>
            ))}
          </div>
          <div className="field-label">
            {t("使用这些资料", "Use these sources")}
          </div>
          <div className="source-choices">
            {project.sources.map((s) => (
              <label key={s.id}>
                <Checkbox
                  checked={selected.includes(s.id)}
                  onCheckedChange={(checked) =>
                    setSelected((ids) =>
                      checked
                        ? [...ids, s.id]
                        : ids.filter((id) => id !== s.id),
                    )
                  }
                />
                <span>{s.name}</span>
              </label>
            ))}
          </div>
          <p className="small-copy">
            {t(
              "每次选取最相关的 3 段文字，适合逐节写作。",
              "Uses up to 3 relevant passages. Best for short sections.",
            )}
          </p>
          {status === "generating" ? (
            <button
              className="secondary-button"
              onClick={async () => {
                const ai = await import("@/lib/folio/ai");
                ai.stopModel();
              }}
            >
              <Square size={13} />
              {t("停止生成", "Stop generating")}
            </button>
          ) : (
            <button
              className="primary-button"
              disabled={!selected.length}
              onClick={generate}
            >
              <Sparkles size={15} />
              {t("生成草稿", "Generate draft")}
              <ArrowUpRight size={14} />
            </button>
          )}
        </>
      )}
      {error && (
        <div className="inline-error" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}
      {draft && (
        <div className="draft-preview">
          <div className="panel-heading">
            {t("待核对的草稿", "DRAFT · REVIEW NEEDED")}
          </div>
          {draft.paragraphs.map((p, i) => (
            <p key={i}>
              {p.text}
              <span className="draft-refs">{p.evidenceIds.join(" · ")}</span>
            </p>
          ))}
          <p className="small-copy">
            {t(
              "引用存在不代表结论正确，请核对后采用。",
              "A valid citation does not guarantee a supported claim. Review before accepting.",
            )}
          </p>
          <button
            className="primary-button"
            onClick={() => {
              onAdopt(draft);
              setDraft(null);
            }}
          >
            <Check size={15} />
            {t("追加到正文", "Append to document")}
          </button>
          <button className="discard-button" onClick={() => setDraft(null)}>
            {t("放弃这次草稿", "Discard draft")}
          </button>
        </div>
      )}
    </div>
  );
}
