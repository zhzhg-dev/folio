import { useEffect, useRef, useState } from "react";
import { Search, FileText, BookOpen, Bookmark, FolderOpen } from "lucide-react";
import type { Project, Language } from "@/lib/folio/model";
import {
  workspaceSearchInput,
  type SearchHit,
  type SearchKind,
} from "@/lib/folio/workspace-search";
import { isActiveProject } from "@/lib/folio/projects";

export default function WorkspaceSearch({
  projects,
  language,
  onOpen,
}: {
  projects: Project[];
  language: Language;
  onOpen: (hit: SearchHit) => void;
}) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("");
  const [kind, setKind] = useState<SearchKind | "all">("all");
  const [result, setResult] = useState<{ hits: SearchHit[]; total: number }>({
    hits: [],
    total: 0,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [ready, setReady] = useState(0);
  const worker = useRef<Worker | null>(null),
    sequence = useRef(0);
  const labels = {
    all: t("全部类型", "All types"),
    project: t("项目", "Projects"),
    question: t("问题", "Questions"),
    finding: t("发现", "Findings"),
    source: t("资料", "Sources"),
    brief: t("简报", "Briefs"),
  };
  useEffect(() => {
    setError("");
    setBusy(true);
    setResult({ hits: [], total: 0 });
    sequence.current++;
    let w: Worker | null = null;
    try {
      const documents = workspaceSearchInput(projects, scope);
      w = new Worker(
        new URL("../../lib/folio/workspace-search.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.current = w;
      w.onmessage = (event) => {
        if (event.data.ready) setReady((v) => v + 1);
      };
      w.onerror = () => {
        setError(
          t(
            "搜索暂不可用，请关闭后重试。",
            "Search is unavailable. Close and reopen to retry.",
          ),
        );
        setBusy(false);
        w?.terminate();
        worker.current = null;
      };
      w.postMessage({ documents });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search unavailable");
      setBusy(false);
    }
    return () => {
      w?.terminate();
      worker.current = null;
      sequence.current++;
    };
  }, [projects, scope, language]);
  useEffect(() => {
    const w = worker.current;
    if (!w) return;
    setBusy(true);
    const id = ++sequence.current;
    const timeout = window.setTimeout(() => {
      if (sequence.current === id) {
        w.terminate();
        worker.current = null;
        setBusy(false);
        setError(
          t(
            "搜索超时，请缩小项目范围后重试。",
            "Search timed out. Choose a smaller project to retry.",
          ),
        );
      }
    }, 15000);
    w.onmessage = (event) => {
      if (event.data.ready) {
        setReady((v) => v + 1);
        return;
      }
      if (event.data.id === sequence.current) {
        clearTimeout(timeout);
        setResult({ hits: event.data.hits, total: event.data.total });
        setBusy(false);
      }
    };
    const delay = window.setTimeout(
      () => w.postMessage({ id, query: query.slice(0, 200), kind }),
      180,
    );
    return () => {
      clearTimeout(delay);
      clearTimeout(timeout);
      sequence.current++;
    };
  }, [query, kind, ready, scope, projects, language]);
  return (
    <div className="workspace-search">
      <label className="workspace-search-input">
        <Search size={18} />
        <input
          autoFocus
          aria-label={t("搜索研究内容", "Search research")}
          value={query}
          maxLength={200}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t(
            "查找问题、发现、备注或原文…",
            "Find a question, finding, note or passage…",
          )}
        />
      </label>
      <div className="search-filters">
        <label>
          {t("搜索范围", "Search in")}
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="">{t("所有活跃项目", "All active projects")}</option>
            {projects.filter(isActiveProject).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("类型", "Type")}
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as SearchKind | "all")}
          >
            {Object.entries(labels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="capture-hint">
        {t(
          "搜索当前资料版本与活跃研究内容。归档内容可在“整理研究”中恢复。",
          "Searches current source revisions and active research. Restore archived work from Organize research.",
        )}
      </p>
      <p className="search-status" role="status">
        {error ||
          (busy
            ? t("正在查找…", "Searching…")
            : result.total
              ? t(
                  `找到 ${result.total} 项${result.total > 60 ? "，显示前 60 项" : ""}`,
                  `${result.total} ${result.total === 1 ? "result" : "results"}${result.total > 60 ? "; showing the first 60" : ""}`,
                )
              : t("没有找到匹配内容", "No matching results"))}
      </p>
      <div className="workspace-search-results" aria-busy={busy}>
        {!error &&
          !busy &&
          result.hits.map((hit) => {
            const Icon =
              hit.kind === "source"
                ? FileText
                : hit.kind === "finding"
                  ? Bookmark
                  : hit.kind === "project"
                    ? FolderOpen
                    : BookOpen;
            return (
              <button
                key={JSON.stringify([hit.projectId, hit.kind, hit.id])}
                onClick={() => onOpen(hit)}
              >
                <Icon size={18} />
                <span>
                  <small>
                    {hit.projectName} · {labels[hit.kind]}
                    {hit.page ? ` · p. ${hit.page}` : ""}
                  </small>
                  <strong>{hit.title}</strong>
                  {hit.snippet && <p>{hit.snippet}</p>}
                </span>
              </button>
            );
          })}
      </div>
    </div>
  );
}
