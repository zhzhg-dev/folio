"use client";
import { AlertCircle, ArrowUpRight, CheckCheck } from "lucide-react";
import { citations, type Project, type Language } from "@/lib/folio/model";
import { citationStatus } from "@/lib/folio/integrity";
export default function ReviewView({
  project,
  language,
  onReview,
}: {
  project: Project;
  language: Language;
  onReview: (attrs: Record<string, string>) => void;
}) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const items = citations(project.content).filter(
    (c) => citationStatus(c.attrs || {}, project) !== "current",
  );
  return (
    <section className="collection-page">
      <div className="collection-header">
        <div>
          <span className="overline">
            {t("让来源始终清晰", "KEEP YOUR SOURCES IN SIGHT")}
          </span>
          <h1>{t("来源更新检查", "Source review")}</h1>
          <p>
            {t(
              "核对原文的变化，保留自己的判断。正文不会自动改写。",
              "Review changes in your sources. Your writing stays in your control.",
            )}
          </p>
        </div>
      </div>
      {items.length ? (
        <div className="review-list">
          {items.map((item, index) => {
            const source = project.sources.find(
              (s) => s.id === item.attrs?.sourceId,
            );
            const state = citationStatus(item.attrs || {}, project);
            return (
              <div className="review-item" key={index}>
                <div className="review-item-heading">
                  <span className="evidence-number">{item.attrs?.label}</span>
                  <strong>
                    {source?.name || t("来源缺失", "Missing source")}
                  </strong>
                  <span className="review-badge">
                    {state === "changed"
                      ? t("原文已变", "Passage changed")
                      : state === "older"
                        ? t("有更新版本", "Newer version")
                        : t("需要核对", "Needs review")}
                  </span>
                </div>
                <p className="review-quote">{item.attrs?.quote}</p>
                <div className="review-item-bottom">
                  <span>
                    {t(
                      "检查这段原文是否仍然支持正文中的表述。",
                      "Check whether this evidence still supports your writing.",
                    )}
                  </span>
                  <button
                    className="secondary-button"
                    disabled={!source}
                    onClick={() =>
                      onReview(item.attrs as Record<string, string>)
                    }
                  >
                    {t("核对并更换引用", "Review & replace citation")}
                    <ArrowUpRight size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <CheckCheck size={32} />
          <h2>
            {t("引用都指向当前版本", "Citations point to current versions")}
          </h2>
          <p>
            {t(
              "资料更新后，这里会显示需要检查的引用。结论是否得到支持，仍需要你判断。",
              "Source updates will appear here. Evidence support still needs your review.",
            )}
          </p>
        </div>
      )}
    </section>
  );
}
