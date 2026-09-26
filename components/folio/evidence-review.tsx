import { ArrowUpRight, Check, ChevronDown } from "lucide-react";
import type {
  Evidence,
  Language,
  Project,
  ResearchTurn,
} from "@/lib/folio/model";
import { evidenceExists } from "@/lib/folio/research";

export default function EvidenceReview({
  turn,
  project,
  language,
  onEvidence,
  onReview,
}: {
  turn: ResearchTurn;
  project: Project;
  language: Language;
  onEvidence: (e: Evidence) => void;
  onReview: (ids: string[]) => void;
}) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const reviewed = turn.reviewedEvidenceIds || [];
  const groups = [...new Set(turn.evidence.map((e) => e.sourceId))];
  const missing = turn.sourceIds
    .filter((id) => !groups.includes(id))
    .map((id) => project.sources.find((s) => s.id === id)?.name)
    .filter(Boolean);
  if (!turn.evidence.length) return null;
  return (
    <details className="evidence-review">
      <summary>
        <span>
          <span className="evidence-review-dot" />
          {t("证据清单", "Evidence ledger")}
        </span>
        <span>
          {t(
            `${reviewed.length}/${turn.evidence.length} 条已核对`,
            `${reviewed.length}/${turn.evidence.length} reviewed`,
          )}
          <ChevronDown size={14} />
        </span>
      </summary>
      <div className="evidence-review-body">
        <p className="ledger-caption">
          {t(
            "逐条阅读原文后，记录你的核对进度。此标记由你设置，不代表 AI 已验证结论。",
            "Read each passage and record your review. These are your checkmarks, not an AI assessment of the claim.",
          )}
        </p>
        <div className="evidence-grid">
          {groups.map((sourceId) => (
            <section className="evidence-source-group" key={sourceId}>
              <h3>
                {turn.evidence.find((e) => e.sourceId === sourceId)?.name}
              </h3>
              {turn.evidence
                .filter((e) => e.sourceId === sourceId)
                .map((e) => {
                  const source = project.sources.find(
                    (s) => s.id === e.sourceId,
                  );
                  const version =
                    source?.versions.findIndex((v) => v.id === e.versionId) ??
                    -1;
                  const current = source?.versions.at(-1)?.id === e.versionId;
                  const valid = evidenceExists(e, project);
                  return (
                    <div className="ledger-passage" key={e.id}>
                      <div className="ledger-location">
                        <span>
                          {e.id} · {t("页", "p.")} {e.page} · v{version + 1}
                        </span>
                        <span>
                          {!valid
                            ? t("无法核对", "Unavailable")
                            : current
                              ? t("当前版本", "Current revision")
                              : t("旧版本", "Earlier revision")}
                        </span>
                      </div>
                      <blockquote>{e.quote}</blockquote>
                      <div className="ledger-actions">
                        <button
                          className="text-action"
                          disabled={!valid}
                          onClick={() => onEvidence(e)}
                        >
                          {t("打开原文", "Open source")}
                          <ArrowUpRight size={13} />
                        </button>
                        <button
                          className={`review-toggle ${reviewed.includes(e.id) ? "is-reviewed" : ""}`}
                          aria-pressed={reviewed.includes(e.id)}
                          disabled={!valid}
                          onClick={() =>
                            onReview(
                              reviewed.includes(e.id)
                                ? reviewed.filter((id) => id !== e.id)
                                : [...reviewed, e.id],
                            )
                          }
                        >
                          <Check size={14} />
                          {reviewed.includes(e.id)
                            ? t("我已核对", "Reviewed by me")
                            : t("标记已核对", "Mark reviewed")}
                        </button>
                      </div>
                    </div>
                  );
                })}
            </section>
          ))}
        </div>
        {missing.length > 0 && (
          <p className="ledger-caption">
            {t("未出现在本次摘录中：", "Not represented in these passages: ")}
            {missing.join(" · ")}.{" "}
            {t(
              "这不表示资料没有相关内容，可以缩小范围再次查找。",
              "This does not establish that a source has no relevant information. Narrow the scope to search it directly.",
            )}
          </p>
        )}
      </div>
    </details>
  );
}
