"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  BookOpen,
  Search,
  Plus,
  FileText,
  FolderOpen,
  Clock3,
  Settings2,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  PanelRightClose,
  PanelRightOpen,
  MoreHorizontal,
  Download,
  Check,
  Bold,
  Italic,
  List,
  ListOrdered,
  Quote,
  Undo2,
  Redo2,
  Sparkles,
  Maximize2,
  ShieldCheck,
  ArrowLeft,
  Languages,
  ArrowRight,
  MessageSquare,
  Columns3,
} from "lucide-react";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Toaster, toast } from "sonner";
import type { Editor } from "@tiptap/react";
import {
  seedWorkspace,
  makeProject,
  plainText,
  citations,
  type WorkspaceData,
  uid,
  para,
  type Project,
  type Source,
  type SourceVersion,
  type Language,
  type Evidence,
  type ReadingPosition,
  type ResearchState,
} from "@/lib/folio/model";
import { loadWorkspace, saveWorkspace } from "@/lib/folio/storage";
import { createAutosave } from "@/lib/folio/autosave";
import DocumentEditor from "./document-editor";
import FeatureDialog from "./feature-dialog";
import SourceDetail from "./source-detail";
import Assistant from "./assistant";
import ResearchNotebook from "./research-notebook";
import {
  emptyNotebook,
  notebookExample,
  notebookFor,
  findingNodes,
  findingsFromDraft,
  notebookLimits,
} from "@/lib/folio/notebook";
import type { Finding } from "@/lib/folio/model";
import ReviewView from "./review-view";
import ComparisonView from "./comparison-view";
import {
  emptyComparison,
  comparisonBrief,
  comparisonProgress,
} from "@/lib/folio/comparison";
import {
  exportMarkdown,
  exportWord,
  exportHtml,
  exportBackup,
} from "@/lib/folio/files";
import { countChanges, citationStatus } from "@/lib/folio/integrity";
import type { Draft } from "@/lib/folio/ai";
import { useWebMCP } from "./webmcp";
import { errorMessage } from "@/lib/folio/i18n";
import { draftNodes } from "@/lib/folio/research";

function EditableText({
  className,
  label,
  value,
  onChange,
}: {
  className: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className={`editable-field ${className}-field`}>
      <span aria-hidden="true">
        {value || " "}
        {"\u200b"}
      </span>
      <textarea
        className={className}
        aria-label={label}
        value={value}
        rows={1}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function NavigationContent({ children }: { children: React.ReactNode }) {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarContent
      className="sidebar-inner"
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("button"))
          setOpenMobile(false);
      }}
    >
      {children}
    </SidebarContent>
  );
}

export default function Workspace({
  onReady: workspaceReady,
  onFailure,
}: { onReady?: () => void; onFailure?: () => void } = {}) {
  const [data, setData] = useState<WorkspaceData>(seedWorkspace);
  const [loaded, setLoaded] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportLock = useRef(false);
  const [saving, setSaving] = useState("saved");
  const [view, setView] = useState("editor");
  const [rightOpen, setRightOpen] = useState(false);
  const [questionId, setQuestionId] = useState("");
  const [newQuestion, setNewQuestion] = useState("");
  const [focus, setFocus] = useState(false);
  const [dialog, setDialog] = useState<string | null>(null);
  const dialogRef = useRef<string | null>(null);
  if (dialog) dialogRef.current = dialog;
  const dialogKind = dialog || dialogRef.current;
  const [newName, setNewName] = useState("");
  const [newTemplate, setNewTemplate] = useState("research");
  const [query, setQuery] = useState("");
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [selectedQuote, setSelectedQuote] = useState("");
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [updateSourceId, setUpdateSourceId] = useState<string | null>(null);
  const [replacing, setReplacing] = useState<Record<string, string> | null>(
    null,
  );
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const evidenceReturn = useRef<HTMLElement | null>(null);
  const [panelTab, setPanelTab] = useState("sources");
  const [undoInsertion, setUndoInsertion] = useState<{
    projectId: string;
    before: Project["content"];
    after: Project["content"];
  } | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const autosave = useRef<ReturnType<
    typeof createAutosave<WorkspaceData>
  > | null>(null);
  const languageRef = useRef(data.language);
  languageRef.current = data.language;
  const project =
    data.projects.find((p) => p.id === data.activeId) || data.projects[0];
  const notebook = notebookFor(project);
  const activeQuestion =
    notebook.questions.find((q) => q.id === questionId) ||
    notebook.questions[0];
  const t = useCallback(
    (zh: string, en: string) => (data.language === "zh" ? zh : en),
    [data.language],
  );
  const onReady = useCallback((e: Editor) => setEditor(e), []);
  const changeLanguage = useCallback((language: Language) => {
    setData((current) => ({
      ...current,
      language,
      languagePreferenceVersion: 1,
    }));
  }, []);
  useEffect(() => {
    loadWorkspace()
      .then((v) => {
        setData(v);
        const active = v.projects.find((p) => p.id === v.activeId);
        setView(active?.lastView || "editor");
        // Keep the saved position, but resume the reader only on user request.
        setLoaded(true);
      })
      .catch(() => {
        toast.error(
          "Could not open local storage. Check your browser permissions.",
        );
        setSaving("error");
        onFailure?.();
      });
  }, []);
  useEffect(() => {
    if (loaded) workspaceReady?.();
  }, [loaded, workspaceReady]);
  useEffect(() => {
    const queue = createAutosave(saveWorkspace, (state, error) => {
      setSaving(state);
      if (state === "error")
        toast.error(errorMessage(error, languageRef.current));
    });
    autosave.current = queue;
    const flush = () => {
      if (document.hidden) void queue.flush();
    };
    document.addEventListener("visibilitychange", flush);
    return () => {
      queue.dispose();
      document.removeEventListener("visibilitychange", flush);
    };
  }, []);
  useEffect(() => {
    if (loaded) autosave.current?.schedule(data);
  }, [data, loaded]);
  useEffect(() => {
    document.documentElement.lang = data.language === "zh" ? "zh-CN" : "en";
    document.title =
      data.language === "zh"
        ? "Folio · 研究与决策"
        : "Folio — Research & decisions";
  }, [data.language]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setDialog("search");
      }
      if (e.key === "Escape") setFocus(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    if (saving === "saved") return;
    const beforeUnload = (e: BeforeUnloadEvent) => {
      void autosave.current?.flush();
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [saving]);
  useEffect(() => {
    if (
      process.env.NODE_ENV === "production" &&
      "serviceWorker" in navigator &&
      document.documentElement.dataset.folioSafe !== "true"
    ) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  const updateProject = useCallback((changes: Partial<Project>) => {
    setData((current) => ({
      ...current,
      projects: current.projects.map((p) =>
        p.id === current.activeId
          ? { ...p, ...changes, updatedAt: new Date().toISOString() }
          : p,
      ),
    }));
  }, []);
  const saveReading = (reading: ReadingPosition) => updateProject({ reading });
  const updateResearch = (research: ResearchState) => {
    const id = project.id;
    setData((current) => ({
      ...current,
      projects: current.projects.map((p) =>
        p.id === id
          ? { ...p, research, updatedAt: new Date().toISOString() }
          : p,
      ),
    }));
  };
  const inspectEvidence = (e: Evidence) => {
    evidenceReturn.current = document.activeElement as HTMLElement;
    saveReading({
      sourceId: e.sourceId,
      versionId: e.versionId,
      page: e.page,
      quote: e.quote,
    });
    setEvidenceOpen(true);
  };
  useEffect(() => {
    if (!loaded || project.lastView === view) return;
    updateProject({ lastView: view });
  }, [view, loaded, project.id]);
  const openSource = (source: Source, quote = "", versionId = "") => {
    setSelectedSource(source);
    const version =
      source.versions.find((v) => v.id === versionId) ||
      source.versions.at(-1)!;
    saveReading({
      sourceId: source.id,
      versionId: version.id,
      page:
        version.pages.find((p) => quote && p.text.includes(quote))?.page || 1,
      quote,
    });
    setPanelTab("sources");
    setSelectedQuote(quote);
    setSelectedVersionId(versionId);
    setReplacing(null);
    setRightOpen(true);
    setView("editor");
  };
  const onCitation = (attrs: Record<string, string>) => {
    const source = project.sources.find((s) => s.id === attrs.sourceId);
    if (source) openSource(source, attrs.quote, attrs.versionId);
  };
  const snapshot = (title: string) => ({
    id: uid(),
    title,
    content: structuredClone(project.content),
    reportTitle: project.reportTitle,
    createdAt: new Date().toISOString(),
  });
  const saveSnapshot = (name: string) => {
    updateProject({ snapshots: [snapshot(name), ...project.snapshots] });
    toast.success(t("版本已保存", "Version saved"));
  };
  const importSources = (incoming: Source[], updateId: string | null) => {
    const bytes = [...project.sources, ...incoming].reduce(
      (sum, s) => sum + s.versions.reduce((n, v) => n + v.size, 0),
      0,
    );
    if (bytes > 80 * 1024 * 1024)
      throw new Error(
        t(
          "当前版本每个项目最多存放 80 MB 原文件（含历史版本）",
          "This version supports 80 MB of original files per project, including revisions",
        ),
      );
    if (updateId) {
      const current = project.sources.find((s) => s.id === updateId);
      if (!current)
        throw new Error(t("找不到要更新的资料", "Source no longer exists"));
      if (current.versions.at(-1)?.hash === incoming[0].versions[0].hash) {
        toast.info(t("文件内容没有变化", "The source has not changed"));
        return;
      }
      updateProject({
        sources: project.sources.map((s) =>
          s.id === updateId
            ? { ...s, versions: [...s.versions, incoming[0].versions[0]] }
            : s,
        ),
      });
      setView(
        project.notebook
          ? "findings"
          : project.comparison
            ? "comparison"
            : "review",
      );
      setSelectedSource(null);
      setReplacing(null);
      toast.success(
        t(
          "已保留新旧版本，请核对引用",
          "Both versions kept. Review the citations.",
        ),
      );
    } else {
      const existing = new Set(
        project.sources.flatMap((s) => s.versions.map((v) => v.hash)),
      );
      const unique = incoming.filter((s) => {
        const hash = s.versions[0].hash;
        if (existing.has(hash)) return false;
        existing.add(hash);
        return true;
      });
      updateProject({
        sources: [...project.sources, ...unique],
        research: project.research
          ? {
              ...project.research,
              selectedSourceIds: [
                ...project.research.selectedSourceIds,
                ...unique.map((s) => s.id),
              ],
            }
          : undefined,
      });
      toast.success(
        t(
          "已添加 " + unique.length + " 份资料",
          unique.length + " sources added",
        ),
      );
    }
    setUpdateSourceId(null);
  };
  const addCitation = (
    source: Source,
    version: SourceVersion,
    page: number,
    quote: string,
  ) => {
    if (!version.text.includes(quote)) {
      toast.error(t("引用原文校验失败", "Citation validation failed"));
      return;
    }
    const attrs = {
      sourceId: source.id,
      versionId: version.id,
      page,
      quote,
      label: String(project.sources.indexOf(source) + 1),
    };
    if (replacing) {
      const content = structuredClone(project.content);
      let replaced = false;
      const visit = (node: typeof content) => {
        if (
          !replaced &&
          node.type === "citation" &&
          node.attrs?.sourceId === replacing.sourceId &&
          node.attrs?.versionId === replacing.versionId &&
          node.attrs?.quote === replacing.quote
        ) {
          node.attrs = attrs;
          replaced = true;
        }
        node.content?.forEach(visit);
      };
      visit(content);
      if (!replaced) {
        toast.error(
          t(
            "原引用已改变，请重新选择",
            "The citation changed. Select it again.",
          ),
        );
        return;
      }
      updateProject({
        content,
        snapshots: [
          snapshot(t("更换引用之前", "Before replacing citation")),
          ...project.snapshots,
        ],
      });
      setReplacing(null);
      setSelectedQuote(quote);
      setSelectedVersionId(version.id);
    } else
      editor?.chain().focus().insertContent({ type: "citation", attrs }).run();
    toast.success(
      t(
        "引用已插入，请检查正文表述",
        "Citation inserted. Review the associated claim.",
      ),
    );
  };
  const undoLastInsertion = () => {
    if (!undoInsertion || undoInsertion.projectId !== project.id) return;
    if (
      JSON.stringify(project.content) !== JSON.stringify(undoInsertion.after)
    ) {
      toast.info(
        t(
          "正文已有后续修改，可从版本记录恢复。",
          "The document has changed. Restore the earlier snapshot from Version history.",
        ),
      );
      return;
    }
    updateProject({ content: undoInsertion.before });
    setUndoInsertion(null);
    toast.success(
      t(
        "已撤销写入，问答记录仍保留。",
        "Insertion undone. The research response is still saved.",
      ),
    );
  };
  const adoptDraft = (draft: Draft): boolean => {
    try {
      const nodes = draftNodes(draft, project);
      const before = structuredClone(project.content);
      const after = {
        ...project.content,
        content: [...(project.content.content || []), ...nodes],
      };
      updateProject({
        content: after,
        snapshots: [
          snapshot(t("写入研究内容之前", "Before adding research passages")),
          ...project.snapshots,
        ],
      });
      setUndoInsertion({ projectId: project.id, before, after });
      toast.success(
        t(
          "内容和引用已写入文稿。可用顶部按钮撤销。",
          "Added with citations. Use Undo insertion above to reverse it.",
        ),
      );
      return true;
    } catch (error) {
      toast.error(errorMessage(error, data.language));
      return false;
    }
  };
  const runExport = async (format: "word" | "html" | "backup") => {
    if (exportLock.current) return;
    exportLock.current = true;
    setExporting(true);
    try {
      if (format === "word") await exportWord(project, data.language);
      if (format === "html") exportHtml(project, data.language);
      if (format === "backup") await exportBackup(project);
      toast.success(
        t("文件已准备好，请点击保存", "File ready. Use Save file to download"),
      );
    } catch (e) {
      toast.error(errorMessage(e, data.language));
    } finally {
      exportLock.current = false;
      setExporting(false);
    }
  };
  useWebMCP(project, data.projects, (id) => {
    setData((d) => ({ ...d, activeId: id }));
    setSelectedSource(null);
    setView("editor");
  });
  const headings =
    project.content.content
      ?.filter((n) => n.type === "heading")
      .map((n) => plainText(n)) || [];
  const documentText = plainText(project.content).replace(/\[\d+\]/g, "");
  const isChineseDocument =
    (documentText.match(/[\u4e00-\u9fff]/g) || []).length /
      Math.max(1, documentText.length) >
    0.2;
  const wordCount = isChineseDocument
    ? documentText.replace(/\s/g, "").length
    : (documentText.match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu) || []).length;
  const createProject = () => {
    if (!newName.trim()) return;
    const next = makeProject(newName.trim(), data.language);
    if (newTemplate === "comparison") {
      next.comparison = emptyComparison(data.language);
      next.lastView = "comparison";
    } else {
      next.notebook = emptyNotebook();
      next.lastView = "findings";
    }
    setData((current) => ({
      ...current,
      projects: [...current.projects, next],
      activeId: next.id,
    }));
    setNewName("");
    setDialog(null);
    setSelectedSource(null);
    setView(next.lastView || "editor");
  };
  const addComparisonExample = () => {
    const next = notebookExample(data.language);
    setData((current) => ({
      ...current,
      projects: [...current.projects, next],
      activeId: next.id,
    }));
    setSelectedSource(null);
    setDialog(null);
    setView("findings");
    setQuestionId("");
  };
  const buildComparisonBrief = () => {
    try {
      const nodes = comparisonBrief(project, data.language);
      const before = structuredClone(project.content);
      const after = {
        ...before,
        content: [...(before.content || []), ...nodes],
      };
      updateProject({
        content: after,
        snapshots: [
          snapshot(t("写入比较简报之前", "Before adding decision brief")),
          ...project.snapshots,
        ],
      });
      setUndoInsertion({ projectId: project.id, before, after });
      setView("editor");
      toast.success(
        t(
          "简报已写入。请检查建议和待确认事项。",
          "Brief added. Review the recommendation and open questions.",
        ),
      );
    } catch (error) {
      toast.error(errorMessage(error, data.language));
    }
  };
  const startResearch = (objective: string) => {
    const question = { id: uid(), title: objective };
    updateProject({
      name: project.name === "Untitled research" ? objective : project.name,
      reportTitle:
        project.reportTitle === "Untitled research"
          ? objective
          : project.reportTitle,
      notebook: { objective, questions: [question], findings: [] },
    });
    setQuestionId(question.id);
  };
  const addFindingToBrief = (finding: Finding) => {
    try {
      const nodes = findingNodes(finding, project, data.language);
      const before = structuredClone(project.content);
      const after = {
        ...before,
        content: [...(before.content || []), ...nodes],
      };
      updateProject({
        content: after,
        snapshots: [
          snapshot(t("加入发现之前", "Before adding a finding")),
          ...project.snapshots,
        ],
      });
      setUndoInsertion({ projectId: project.id, before, after });
      toast.success(
        t(
          "已加入简报，包含引用、备注和核对状态。",
          "Added to brief with citations, note and review status.",
        ),
        {
          action: {
            label: t("查看简报", "View brief"),
            onClick: () => setView("editor"),
          },
        },
      );
    } catch (error) {
      toast.error(errorMessage(error, data.language));
    }
  };
  const keepDraft = (draft: Draft): boolean => {
    if (!activeQuestion) {
      toast.info(
        t("请先创建一个研究问题。", "Create a research question first."),
      );
      setView("findings");
      return false;
    }
    if (
      notebook.findings.length + draft.paragraphs.length >
      notebookLimits.findings
    ) {
      toast.error(
        t(
          "每个项目最多保留 200 条发现。",
          "Keep up to 200 findings per project.",
        ),
      );
      return false;
    }
    try {
      draftNodes(draft, project);
      updateProject({
        notebook: {
          ...notebook,
          findings: [
            ...notebook.findings,
            ...findingsFromDraft(draft, activeQuestion.id),
          ],
        },
      });
      toast.success(
        t(
          "已保留为发现，等待你的核对。",
          "Saved as findings, ready for your review.",
        ),
        {
          action: {
            label: t("查看发现", "View findings"),
            onClick: () => setView("findings"),
          },
        },
      );
      return true;
    } catch (error) {
      toast.error(errorMessage(error, data.language));
      return false;
    }
  };
  const askQuestion = (question: string) => {
    updateProject({
      research: {
        question,
        selectedSourceIds: project.sources.map((s) => s.id),
        mode: project.research?.mode || "passages",
        turns: project.research?.turns || [],
      },
    });
    setView("research");
  };
  const downloadMarkdown = () => {
    exportMarkdown(project, data.language);
    toast.success(
      t("Markdown 已准备好，请保存文件", "Markdown ready. Save the file below"),
    );
  };
  const formatting = [
    {
      Icon: Bold,
      label: t("加粗", "Bold"),
      active: "bold",
      run: () => editor?.chain().focus().toggleBold().run(),
    },
    {
      Icon: Italic,
      label: t("斜体", "Italic"),
      active: "italic",
      run: () => editor?.chain().focus().toggleItalic().run(),
    },
    {
      Icon: List,
      label: t("项目列表", "Bullet list"),
      active: "bulletList",
      run: () => editor?.chain().focus().toggleBulletList().run(),
    },
    {
      Icon: ListOrdered,
      label: t("有序列表", "Numbered list"),
      active: "orderedList",
      run: () => editor?.chain().focus().toggleOrderedList().run(),
    },
    {
      Icon: Quote,
      label: t("引用段落", "Block quote"),
      active: "blockquote",
      run: () => editor?.chain().focus().toggleBlockquote().run(),
    },
  ];
  if (!loaded)
    return (
      <main className="startup-screen" role="status">
        <BookOpen size={28} strokeWidth={1.5} />
        <strong>folio.</strong>
        <p>
          {saving === "error"
            ? "无法打开本地存储，请检查浏览器权限后刷新。 / Storage unavailable. Check browser permissions and reload."
            : "Opening your workspace…"}
        </p>
      </main>
    );
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "218px" } as React.CSSProperties}
      className={`folio-app ${focus ? "is-focused" : ""}`}
    >
      <Sidebar className="folio-sidebar" collapsible="offcanvas">
        <SidebarHeader className="brand-area">
          <button className="all-research" onClick={() => setDialog("search")}>
            <ArrowLeft size={16} />
            {t("所有研究", "All research")}
          </button>
          <button
            className="sidebar-project-name"
            onClick={() => setDialog("document")}
          >
            {project.name}
          </button>
          <span className="sidebar-project-status">
            {project.example
              ? t("虚构示例", "Fictional sample")
              : t("研究中", "In progress")}
          </span>
        </SidebarHeader>
        <NavigationContent>
          <div className="question-navigation">
            <div className="sidebar-label">{t("研究问题", "Questions")}</div>
            <nav
              className="main-nav question-nav"
              aria-label={t("研究问题", "Research questions")}
            >
              {notebook.questions.map((q, i) => (
                <button
                  key={q.id}
                  className={
                    q.id === activeQuestion?.id && view === "findings"
                      ? "active"
                      : ""
                  }
                  onClick={() => {
                    setQuestionId(q.id);
                    setView("findings");
                  }}
                >
                  <span className="question-number">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>{q.title}</span>
                </button>
              ))}
              <button
                disabled={notebook.questions.length >= notebookLimits.questions}
                onClick={() => {
                  setNewQuestion("");
                  setDialog("question");
                }}
              >
                <Plus size={16} />
                {t("添加问题", "Add question")}
              </button>
            </nav>
          </div>
          <div className="sidebar-source-group">
            <button onClick={() => setView("library")}>
              <FolderOpen size={16} />
              {project.sources.length}{" "}
              {t(
                "份资料",
                project.sources.length === 1 ? "source file" : "source files",
              )}
            </button>
            <button
              onClick={() => {
                setUpdateSourceId(null);
                setDialog("import");
              }}
            >
              <Plus size={16} />
              {t("添加资料", "Add source")}
            </button>
          </div>
          <details className="workspace-tools">
            <summary>
              {t("更多工具", "More tools")}
              <ChevronDown size={13} />
            </summary>
            <nav className="main-nav" aria-label={t("更多工具", "More tools")}>
              <button onClick={() => setView("comparison")}>
                <Columns3 size={16} />
                {t("方案比较", "Compare options")}
              </button>
              <button onClick={() => setView("history")}>
                <Clock3 size={16} />
                {t("版本记录", "Version history")}
              </button>
              <button onClick={() => setView("review")}>
                <ShieldCheck size={16} />
                {t("简报来源检查", "Brief source review")}
                {countChanges(project) > 0 && (
                  <span className="changes-count">{countChanges(project)}</span>
                )}
              </button>
            </nav>
          </details>
          <details className="workspace-tools project-switcher">
            <summary>
              {t("切换项目", "Switch project")}
              <ChevronDown size={13} />
            </summary>
            <div className="project-list">
              {data.projects.map((p) => (
                <button
                  key={p.id}
                  className={p.id === project.id ? "selected" : ""}
                  onClick={() => {
                    setData((d) => ({ ...d, activeId: p.id }));
                    setSelectedSource(
                      p.sources.find((s) => s.id === p.reading?.sourceId) ||
                        null,
                    );
                    setSelectedVersionId(p.reading?.versionId || "");
                    setSelectedQuote(p.reading?.quote || "");
                    setView(p.lastView || "editor");
                  }}
                >
                  <span className="project-dot">
                    <BookOpen size={13} />
                  </span>
                  <span>{p.name}</span>
                  {p.id === project.id && (
                    <span className="project-selected-dot" />
                  )}
                </button>
              ))}
            </div>
          </details>
          {view === "editor" && (
            <div className="document-outline">
              <div className="sidebar-label">
                <span>{t("文档大纲", "OUTLINE")}</span>
              </div>
              <button
                className="outline-title"
                onClick={() =>
                  document
                    .querySelector(".paper")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
              >
                {project.reportTitle}
              </button>
              {headings.map((h, i) => (
                <button
                  key={`${i}-${h}`}
                  onClick={() =>
                    document
                      .querySelectorAll(".folio-editor h2, .folio-editor h3")
                      [i]?.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                      })
                  }
                >
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  {h}
                </button>
              ))}
            </div>
          )}
          <button className="new-project" onClick={() => setDialog("new")}>
            <Plus size={16} />
            {t("新建项目", "New project")}
          </button>
        </NavigationContent>
        <SidebarFooter className="sidebar-bottom">
          <div className="local-note">
            <ShieldCheck size={16} />
            <div>
              <strong role="status">
                {saving === "saved"
                  ? t("已保存到本机", "Saved locally")
                  : saving === "saving"
                    ? t("正在保存…", "Saving…")
                    : t("保存失败，请备份", "Save failed. Export a backup.")}
              </strong>
              <span>
                {t(
                  "资料始终留在你的浏览器",
                  "Your work stays in this browser.",
                )}
              </span>
            </div>
          </div>
          <button
            className="settings-link"
            onClick={() => setDialog("settings")}
          >
            <span className="profile-avatar">F</span>
            <span>
              {t("我的工作空间", "My workspace")}
              <small>{t("偏好与备份", "Preferences & backups")}</small>
            </span>
            <Settings2 size={17} />
          </button>
        </SidebarFooter>
      </Sidebar>
      <header className="topbar global-topbar">
        <button
          className="brand global-brand"
          onClick={() => {
            setView("findings");
            setFocus(false);
          }}
          aria-label="Folio"
        >
          <svg
            viewBox="0 0 28 28"
            width="25"
            height="25"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M5 21V6a2 2 0 0 1 2-2h15v7M12 25v-5h5l5-5h-5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
          <span>folio</span>
        </button>
        <div className="breadcrumbs">
          <SidebarTrigger className="sidebar-toggle" />
          <span>{t("项目", "Projects")}</span>
          <ChevronRight size={13} />
          <strong>{project.name}</strong>
          {project.example && (
            <span className="example-label">{t("示例", "Sample")}</span>
          )}
        </div>
        <div className="top-actions">
          <button
            className="header-search"
            onClick={() => setDialog("search")}
            aria-label={t("搜索", "Search")}
          >
            <Search size={17} />
            <span>{t("搜索", "Search")}</span>
            <kbd>Ctrl K</kbd>
          </button>
          <div
            className="header-language"
            aria-label={t("界面语言", "Interface language")}
          >
            <button
              aria-pressed={data.language === "en"}
              onClick={() => changeLanguage("en")}
            >
              EN
            </button>
            <span>/</span>
            <button
              aria-pressed={data.language === "zh"}
              onClick={() => changeLanguage("zh")}
            >
              中文
            </button>
          </div>
          {undoInsertion?.projectId === project.id && (
            <button className="undo-insertion" onClick={undoLastInsertion}>
              <Undo2 size={14} />
              {t("撤销写入", "Undo insertion")}
            </button>
          )}
          <span className={`save-state ${saving}`}>
            <Check size={14} />
            {saving === "saved"
              ? t("已保存到本机", "Saved locally")
              : saving === "saving"
                ? t("正在保存…", "Saving…")
                : t("保存失败", "Save failed")}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="export-button" disabled={exporting}>
                {t("导出", "Export")}
                <ArrowUpRight size={14} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => runExport("word")}>
                Word (.docx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={downloadMarkdown}>
                Markdown (.md)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => runExport("html")}>
                HTML (.html)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => runExport("backup")}>
                {t("项目备份", "Project backup")} (.json)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.print()}>
                {t("打印 / 存为 PDF", "Print / Save as PDF")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <main className="workspace-main">
        <nav
          className="workspace-tabs"
          aria-label={t("研究工作区", "Research workspace")}
        >
          <div>
            {[
              ["findings", t("研究", "Research")],
              ["library", t("资料", "Sources")],
              ["editor", t("简报", "Brief")],
            ].map(([id, label]) => (
              <button
                key={id}
                aria-current={view === id ? "page" : undefined}
                className={view === id ? "selected" : ""}
                onClick={() => setView(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="workspace-tab-actions">
            <button className="focus-control" onClick={() => setFocus(!focus)}>
              <Maximize2 size={15} />
              {t("专注", "Focus")}
            </button>
            <button
              className={`ask-folio ${view === "research" ? "selected" : ""}`}
              onClick={() =>
                activeQuestion
                  ? askQuestion(activeQuestion.title)
                  : setView("research")
              }
            >
              <MessageSquare size={16} />
              {t("问 Folio", "Ask Folio")}
            </button>
          </div>
        </nav>
        {view === "findings" ? (
          <ResearchNotebook
            key={project.id}
            project={project}
            language={data.language}
            questionId={activeQuestion?.id || ""}
            onChange={(notebook) => updateProject({ notebook })}
            onStart={startResearch}
            onImport={() => {
              setUpdateSourceId(null);
              setDialog("import");
            }}
            onExample={addComparisonExample}
            onEvidence={inspectEvidence}
            onAdd={addFindingToBrief}
            onBrief={() => setView("editor")}
            onAsk={askQuestion}
          />
        ) : view === "comparison" ? (
          <ComparisonView
            key={project.id}
            project={project}
            language={data.language}
            onChange={(comparison) => updateProject({ comparison })}
            onImport={() => {
              setUpdateSourceId(null);
              setDialog("import");
            }}
            onExample={addComparisonExample}
            onBuild={buildComparisonBrief}
          />
        ) : view === "editor" ? (
          <>
            <div className="editor-toolbar">
              <div className="format-tools">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="text-select">
                      {t("正文", "Text")}
                      <ChevronDown size={12} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem
                      onClick={() =>
                        editor?.chain().focus().setParagraph().run()
                      }
                    >
                      {t("正文", "Paragraph")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        editor
                          ?.chain()
                          .focus()
                          .toggleHeading({ level: 2 })
                          .run()
                      }
                    >
                      {t("标题", "Heading")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <i />
                {formatting.map(({ Icon, label, run, active }) => (
                  <button
                    key={label}
                    title={label}
                    aria-label={label}
                    aria-pressed={
                      !!editor && !editor.isDestroyed && editor.isActive(active)
                    }
                    onClick={run}
                  >
                    <Icon size={16} />
                  </button>
                ))}
                <i />
                <button
                  aria-label={t("撤销", "Undo")}
                  title={t("撤销", "Undo")}
                  onClick={() => editor?.chain().focus().undo().run()}
                >
                  <Undo2 size={16} />
                </button>
                <button
                  aria-label={t("重做", "Redo")}
                  title={t("重做", "Redo")}
                  onClick={() => editor?.chain().focus().redo().run()}
                >
                  <Redo2 size={16} />
                </button>
              </div>
              <div className="view-tools">
                <button
                  onClick={() => setFocus(!focus)}
                  title={t("专注模式", "Focus mode")}
                  aria-label={t("专注模式", "Focus mode")}
                  aria-pressed={focus}
                >
                  <Maximize2 size={16} />
                </button>
                <button
                  onClick={() => setRightOpen(!rightOpen)}
                  title={t("参考资料面板", "Sources panel")}
                  aria-label={t("参考资料面板", "Sources panel")}
                  aria-pressed={rightOpen}
                  className="panel-trigger"
                >
                  {rightOpen ? (
                    <PanelRightClose size={17} />
                  ) : (
                    <PanelRightOpen size={17} />
                  )}
                  <span>{t("资料", "Sources")}</span>
                </button>
              </div>
            </div>
            <div className="work-area">
              <div className="document-scroll">
                <article
                  className="paper"
                  data-writing-language={isChineseDocument ? "zh" : "en"}
                  lang={isChineseDocument ? "zh-CN" : "en"}
                >
                  <div className="document-eyebrow">
                    <span className="document-type">
                      <span />
                      {t("研究笔记", "FIELD NOTES")}
                    </span>
                    <span className="draft-label">{t("草稿", "Draft")}</span>
                    <button
                      aria-label={t("文档设置", "Document settings")}
                      onClick={() => setDialog("document")}
                    >
                      <MoreHorizontal size={20} />
                    </button>
                  </div>
                  <EditableText
                    className="document-title"
                    label={t("报告标题", "Report title")}
                    value={project.reportTitle}
                    onChange={(value) => updateProject({ reportTitle: value })}
                  />
                  <EditableText
                    className="document-description"
                    label={t("报告简介", "Report description")}
                    value={project.description}
                    onChange={(value) => updateProject({ description: value })}
                  />
                  <div className="document-meta">
                    <span className="author-avatar">F</span>
                    <span>{t("我的笔记", "Personal research")}</span>
                    <span>·</span>
                    <span>
                      {new Date(project.createdAt).toLocaleDateString(
                        data.language === "zh" ? "zh-CN" : "en-US",
                        { month: "long", day: "numeric" },
                      )}
                    </span>
                    <span>·</span>
                    <span>
                      {t("约 ", "About ")}
                      {Math.max(
                        1,
                        Math.ceil(wordCount / (isChineseDocument ? 400 : 220)),
                      )}
                      {t(" 分钟阅读", " min read")}
                    </span>
                  </div>
                  <div className="paper-divider" />
                  <DocumentEditor
                    key={project.id + data.language}
                    content={project.content}
                    projectId={project.id}
                    language={data.language}
                    onReady={onReady}
                    onChange={(content) => updateProject({ content })}
                    onCitation={onCitation}
                  />
                  <div className="document-end">
                    <span />
                    {t("想法的下一页，由你续写", "Room for your next thought")}
                    <span />
                  </div>
                </article>
              </div>
              {rightOpen && !focus && (
                <aside className="reference-panel">
                  <Tabs value={panelTab} onValueChange={setPanelTab}>
                    <TabsList variant="line" className="reference-tabs">
                      <TabsTrigger value="sources">
                        {t("参考资料", "Sources")}
                        <span>{project.sources.length}</span>
                      </TabsTrigger>
                      <TabsTrigger value="assistant">
                        {t("写作助手", "Assistant")}
                        <Sparkles size={14} />
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="sources" className="reference-content">
                      {selectedSource ? (
                        <>
                          <SourceDetail
                            key={selectedSource.id + selectedVersionId}
                            source={
                              project.sources.find(
                                (s) => s.id === selectedSource.id,
                              ) || selectedSource
                            }
                            quote={selectedQuote}
                            versionId={selectedVersionId}
                            language={data.language}
                            onBack={() => {
                              setSelectedSource(null);
                              setReplacing(null);
                            }}
                            onUpdate={() => {
                              setUpdateSourceId(selectedSource.id);
                              setDialog("import");
                            }}
                            onCite={addCitation}
                            initialPage={
                              project.reading?.sourceId === selectedSource.id
                                ? project.reading.page
                                : 1
                            }
                            onPosition={saveReading}
                          />
                          {replacing && (
                            <div className="replace-citation-note">
                              {t(
                                "选择一段原文并点击「引用」，即可更换当前引用。正文保持不变。",
                                "Cite a passage to replace this citation. Your writing is preserved.",
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="panel-heading">
                            <span>{t("项目资料", "YOUR SOURCE MATERIAL")}</span>
                            <button
                              aria-label={t("添加资料", "Add source")}
                              onClick={() => setDialog("import")}
                            >
                              <Plus size={16} />
                            </button>
                          </div>
                          <div className="sources-list">
                            {project.sources.map((s) => (
                              <button
                                className="source-row"
                                key={s.id}
                                onClick={() =>
                                  inspectEvidence({
                                    id: uid(),
                                    sourceId: s.id,
                                    versionId: s.versions.at(-1)!.id,
                                    page: 1,
                                    quote: "",
                                    name: s.name,
                                    label: String(
                                      project.sources.indexOf(s) + 1,
                                    ),
                                  })
                                }
                              >
                                <div className={`source-file-icon ${s.color}`}>
                                  <FileText size={19} />
                                </div>
                                <div>
                                  <strong>{s.name}</strong>
                                  <span>
                                    {s.kind.toUpperCase()}
                                    <span>·</span>v{s.versions.length}
                                  </span>
                                </div>
                                <ChevronRight size={14} />
                              </button>
                            ))}
                          </div>
                          <button
                            className="add-source-button"
                            onClick={() => setDialog("import")}
                          >
                            <Plus size={16} />
                            {t("添加资料", "Add a source")}
                            <ArrowRight size={14} />
                          </button>
                          <div className="panel-divider" />
                          <div className="panel-heading">
                            <span>
                              {t("文中的引用", "CITED IN THIS DOCUMENT")}
                            </span>
                            <span>{citations(project.content).length}</span>
                          </div>
                          {citations(project.content).map((c, i) => (
                            <button
                              className="evidence-preview"
                              key={i}
                              onClick={() =>
                                onCitation(c.attrs as Record<string, string>)
                              }
                            >
                              <span className="evidence-number">
                                {c.attrs?.label}
                              </span>
                              <div>
                                <p>{String(c.attrs?.quote)}</p>
                                <span>
                                  {
                                    project.sources.find(
                                      (s) => s.id === c.attrs?.sourceId,
                                    )?.name
                                  }
                                  <ArrowUpRight size={12} />
                                </span>
                              </div>
                            </button>
                          ))}
                          <div className="reference-tip">
                            <BookOpen size={17} />
                            <p>
                              {t(
                                "点击正文中的引用，回到想法的出处。",
                                "Click a citation to return to the source of an idea.",
                              )}
                            </p>
                          </div>
                        </>
                      )}
                    </TabsContent>
                    <TabsContent value="assistant">
                      <div className="research-invitation">
                        <MessageSquare size={25} />
                        <h3>
                          {t(
                            "把问题带回资料",
                            "Bring a question to your sources",
                          )}
                        </h3>
                        <p>
                          {t(
                            "在研究工作区连续提问、核对原文，再把选中的内容写入文稿。",
                            "Ask follow-up questions, verify passages, and bring selected answers into your document.",
                          )}
                        </p>
                        <button
                          className="primary-button"
                          onClick={() => setView("research")}
                        >
                          {t("打开资料问答", "Open research desk")}
                          <ArrowUpRight size={15} />
                        </button>
                        <small>
                          {t(
                            "问答记录自动保存在这个项目中。",
                            "Research history is saved with this project.",
                          )}
                        </small>
                      </div>
                    </TabsContent>
                  </Tabs>
                </aside>
              )}
            </div>
            <footer className="editor-status">
              <div>
                <span className="status-dot" />
                {t("本地工作空间", "Local workspace")}
              </div>
              <span>
                {wordCount.toLocaleString()}{" "}
                {isChineseDocument ? t("字", "characters") : t("词", "words")}
                <i /> {project.sources.length} {t("份资料", "sources")}
                <i />
                <button
                  className="status-language"
                  onClick={() =>
                    changeLanguage(data.language === "en" ? "zh" : "en")
                  }
                  aria-label={t("切换为英文", "Switch to Chinese")}
                >
                  {data.language === "en" ? "EN" : "中文"}
                </button>
              </span>
            </footer>
          </>
        ) : view === "research" ? (
          <div className="research-surface">
            {project.reading && (
              <button
                className="resume-reading"
                onClick={() => setEvidenceOpen(true)}
              >
                <BookOpen size={14} />
                {t("继续阅读 · 第 ", "Resume reading · p. ")}
                {project.reading.page}
              </button>
            )}
            <Assistant
              key={project.id}
              project={project}
              language={data.language}
              onAdopt={adoptDraft}
              onKeep={keepDraft}
              onChange={updateResearch}
              onEvidence={inspectEvidence}
              onImport={() => setDialog("import")}
            />
          </div>
        ) : view === "review" ? (
          <ReviewView
            project={project}
            language={data.language}
            onReview={(attrs) => {
              const source = project.sources.find(
                (s) => s.id === attrs.sourceId,
              );
              if (!source) return;
              openSource(source, attrs.quote, source.versions.at(-1)!.id);
              setReplacing(attrs);
            }}
          />
        ) : (
          <section className="collection-page">
            <div className="collection-header">
              <div>
                <span className="overline">
                  {view === "library"
                    ? t("让知识汇聚", "YOUR KNOWLEDGE, TOGETHER")
                    : t("想法的每一步", "EVERY THOUGHT HAS A HISTORY")}
                </span>
                <h1>
                  {view === "library"
                    ? t("项目资料库", "Your sources")
                    : t("版本记录", "Version history")}
                </h1>
                <p>
                  {view === "library"
                    ? t(
                        "让散落的资料，在这里成为清晰的思路。",
                        "Keep the material behind your ideas in one place.",
                      )
                    : t(
                        "保存重要的时刻，随时回到之前的思路。",
                        "Keep the moments that matter. Return to an earlier thought.",
                      )}
                </p>
              </div>
              <button
                className="primary-button"
                onClick={() =>
                  setDialog(view === "library" ? "import" : "snapshot")
                }
              >
                <Plus size={16} />
                {view === "library"
                  ? t("添加资料", "Add source")
                  : t("保存版本", "Save version")}
              </button>
            </div>
            {view === "library" ? (
              <div className="library-list">
                {project.sources.map((s) => (
                  <button
                    className="library-row"
                    key={s.id}
                    onClick={() => openSource(s)}
                  >
                    <div className={`source-file-icon ${s.color}`}>
                      <FileText size={20} />
                    </div>
                    <strong>{s.name}</strong>
                    <span>{s.kind.toUpperCase()}</span>
                    <span>v{s.versions.length}</span>
                    <ArrowUpRight size={16} />
                  </button>
                ))}
              </div>
            ) : project.snapshots.length ? (
              <div className="snapshot-list">
                {project.snapshots.map((snap, i) => (
                  <div className="snapshot-row" key={snap.id}>
                    <span className="snapshot-icon">
                      <Clock3 size={18} />
                    </span>
                    <div>
                      <strong>{snap.title}</strong>
                      <p>
                        {new Date(snap.createdAt).toLocaleString(
                          data.language === "zh" ? "zh-CN" : "en-US",
                        )}
                      </p>
                    </div>
                    <span className="snapshot-size">
                      {plainText(snap.content).length} {t("字", "characters")}
                    </span>
                    <button
                      className="secondary-button"
                      onClick={() => {
                        updateProject({
                          content: structuredClone(snap.content),
                          reportTitle: snap.reportTitle,
                          snapshots: [
                            snapshot(
                              t("恢复前自动保存", "Before restoring version"),
                            ),
                            ...project.snapshots,
                          ],
                        });
                        setView("editor");
                        toast.success(
                          t(
                            "已恢复，恢复前的内容也已保存",
                            "Restored. Previous content is also saved.",
                          ),
                        );
                      }}
                    >
                      {t("恢复", "Restore")}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <Clock3 size={30} strokeWidth={1.3} />
                <h2>{t("给这一刻留个版本", "Keep this moment")}</h2>
                <p>
                  {t(
                    "正文会自动保存。重要修改之前，还可以单独保存一个版本。",
                    "Your work saves automatically. Save a version before an important change.",
                  )}
                </p>
              </div>
            )}
          </section>
        )}
      </main>
      {focus && (
        <button className="exit-focus" onClick={() => setFocus(false)}>
          <Maximize2 size={14} />
          {t("退出专注", "Exit focus")}
          <kbd>ESC</kbd>
        </button>
      )}
      <Dialog
        open={dialog !== null}
        onOpenChange={(v) => {
          if (!v) {
            setDialog(null);
            setUpdateSourceId(null);
          }
        }}
      >
        <DialogContent className="folio-dialog">
          <DialogHeader>
            <DialogTitle>
              {dialogKind === "question"
                ? t("添加研究问题", "Add a research question")
                : dialogKind === "new"
                  ? t("开始一个新项目", "Start a new project")
                  : dialogKind === "search"
                    ? t("找到你的思路", "Find your thoughts")
                    : dialogKind === "settings"
                      ? t("工作空间设置", "Workspace settings")
                      : dialogKind === "document"
                        ? t("文档信息", "Document details")
                        : dialogKind === "snapshot"
                          ? t("保存文档版本", "Save document version")
                          : t("添加到工作空间", "Add to your workspace")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "这里的内容保存在当前浏览器中。",
                "Your work is stored in this browser.",
              )}
            </DialogDescription>
          </DialogHeader>
          {["import", "snapshot", "settings"].includes(dialogKind || "") ? (
            <FeatureDialog
              key={dialogKind + (updateSourceId || "")}
              kind={dialogKind!}
              project={project}
              language={data.language}
              updateSourceId={updateSourceId}
              onImport={importSources}
              onRestore={(p) => {
                setData((d) => ({
                  ...d,
                  projects: [...d.projects, p],
                  activeId: p.id,
                }));
                setSelectedSource(null);
                setView(
                  p.notebook
                    ? "findings"
                    : p.comparison
                      ? "comparison"
                      : "editor",
                );
                toast.success(t("项目已恢复", "Project restored"));
              }}
              onSnapshot={saveSnapshot}
              onLanguage={() =>
                setData((d) => ({
                  ...d,
                  language: d.language === "zh" ? "en" : "zh",
                }))
              }
              onClose={() => {
                setDialog(null);
                setUpdateSourceId(null);
              }}
            />
          ) : dialogKind === "question" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (
                  !newQuestion.trim() ||
                  notebook.questions.length >= notebookLimits.questions
                )
                  return;
                const q = { id: uid(), title: newQuestion.trim() };
                updateProject({
                  notebook: {
                    ...notebook,
                    objective: notebook.objective || q.title,
                    questions: [...notebook.questions, q],
                  },
                });
                setQuestionId(q.id);
                setDialog(null);
                setView("findings");
              }}
            >
              <label className="field-label" htmlFor="new-question">
                {t("你想回答什么？", "What would you like to answer?")}
              </label>
              <input
                id="new-question"
                autoFocus
                className="field-input"
                value={newQuestion}
                maxLength={200}
                onChange={(e) => setNewQuestion(e.target.value)}
              />
              <button
                className="primary-button dialog-submit"
                disabled={!newQuestion.trim()}
              >
                {t("添加问题", "Add question")}
                <Plus size={15} />
              </button>
            </form>
          ) : dialogKind === "new" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createProject();
              }}
            >
              <label className="field-label">
                {t("项目名称", "Project name")}
              </label>
              <input
                autoFocus
                className="field-input"
                aria-label={t("项目名称", "Project name")}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t(
                  "例如：下一份研究简报",
                  "e.g. Your next research note",
                )}
              />
              <label className="field-label project-template">
                {t("项目类型", "Project type")}
                <select
                  value={newTemplate}
                  onChange={(e) => setNewTemplate(e.target.value)}
                >
                  <option value="comparison">
                    {t("方案比较与研究简报", "Comparison & decision brief")}
                  </option>
                  <option value="research">
                    {t("研究笔记与简报", "Research notebook & brief")}
                  </option>
                </select>
              </label>
              <button
                type="button"
                className="comparison-example-link"
                onClick={addComparisonExample}
              >
                {t(
                  "先体验一个完整的研究示例",
                  "Explore a complete research sample",
                )}
              </button>
              <button
                className="primary-button dialog-submit"
                disabled={!newName.trim()}
              >
                {t("创建项目", "Create project")}
                <ArrowUpRight size={16} />
              </button>
            </form>
          ) : dialogKind === "search" ? (
            <>
              <input
                autoFocus
                className="field-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t(
                  "搜索项目或资料…",
                  "Search projects or sources…",
                )}
              />
              <div className="search-results">
                {data.projects
                  .filter((p) =>
                    `${p.name}${p.reportTitle}`
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setData((d) => ({ ...d, activeId: p.id }));
                        setDialog(null);
                        setView("editor");
                      }}
                    >
                      <FileText size={18} />
                      <span>
                        {p.reportTitle}
                        <small>{p.name}</small>
                      </span>
                      <ArrowUpRight size={16} />
                    </button>
                  ))}
                {data.projects.flatMap((p) =>
                  p.sources
                    .filter(
                      (s) =>
                        query.trim() &&
                        (s.name + s.versions.at(-1)?.text)
                          .toLowerCase()
                          .includes(query.toLowerCase()),
                    )
                    .map((s) => (
                      <button
                        key={p.id + s.id}
                        onClick={() => {
                          setData((d) => ({ ...d, activeId: p.id }));
                          openSource(s);
                          setDialog(null);
                        }}
                      >
                        <FolderOpen size={18} />
                        <span>
                          {s.name}
                          <small>{p.name}</small>
                        </span>
                        <ArrowUpRight size={16} />
                      </button>
                    )),
                )}
                {query.trim() &&
                  !data.projects.some(
                    (p) =>
                      (p.name + p.reportTitle)
                        .toLowerCase()
                        .includes(query.toLowerCase()) ||
                      p.sources.some((s) =>
                        (s.name + s.versions.at(-1)?.text)
                          .toLowerCase()
                          .includes(query.toLowerCase()),
                      ),
                  ) && (
                    <p className="small-copy">
                      {t(
                        "没有找到匹配的项目或资料",
                        "No matching projects or sources",
                      )}
                    </p>
                  )}
              </div>
            </>
          ) : dialogKind === "settings" ? (
            <div className="settings-body">
              <div className="setting-row">
                <span>{t("界面语言", "Interface language")}</span>
                <button
                  className="secondary-button"
                  onClick={() =>
                    setData((d) => ({
                      ...d,
                      language: d.language === "zh" ? "en" : "zh",
                    }))
                  }
                >
                  {data.language === "zh" ? "English" : "简体中文"}
                </button>
              </div>
              <div className="setting-note">
                <ShieldCheck size={19} />
                <p>
                  {t(
                    "资料与正文保存在本机。清理浏览器数据前，请先导出备份。",
                    "Sources and writing stay on your device. Export a backup before clearing browser data.",
                  )}
                </p>
              </div>
            </div>
          ) : dialogKind === "document" ? (
            <>
              <label className="field-label">
                {t("项目名称", "Project name")}
              </label>
              <input
                className="field-input"
                value={project.name}
                onChange={(e) => updateProject({ name: e.target.value })}
              />
            </>
          ) : (
            <div className="empty-state">
              <FolderOpen size={28} />
              <p>
                {t(
                  "选择一个项目，开始整理资料。",
                  "Choose a project to start working with your sources.",
                )}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={evidenceOpen} onOpenChange={setEvidenceOpen}>
        <DialogContent
          className="evidence-dialog"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            evidenceReturn.current?.focus({ preventScroll: true });
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("核对证据", "Verify the evidence")}</DialogTitle>
            <DialogDescription>
              {t(
                "阅读回答所引用的原始资料版本。",
                "Read the exact source revision cited in the response.",
              )}
            </DialogDescription>
          </DialogHeader>
          {project.reading &&
            project.sources.find((s) => s.id === project.reading!.sourceId) && (
              <div className="evidence-reader-body">
                <SourceDetail
                  key={
                    project.reading.sourceId +
                    project.reading.versionId +
                    project.reading.quote
                  }
                  source={project.sources.find(
                    (s) => s.id === project.reading!.sourceId,
                  )!}
                  quote={project.reading.quote}
                  versionId={project.reading.versionId}
                  initialPage={project.reading.page}
                  language={data.language}
                  expanded
                  backLabel={t("返回工作区", "Back to workspace")}
                  onPosition={saveReading}
                  onBack={() => setEvidenceOpen(false)}
                  onUpdate={() => {
                    setEvidenceOpen(false);
                    setUpdateSourceId(project.reading!.sourceId);
                    setDialog("import");
                  }}
                  onCite={(source, version, page, quote) => {
                    adoptDraft({
                      paragraphs: [{ text: quote, evidenceIds: ["E1"] }],
                      evidence: [
                        {
                          id: "E1",
                          sourceId: source.id,
                          versionId: version.id,
                          page,
                          quote,
                          name: source.name,
                          label: String(project.sources.indexOf(source) + 1),
                        },
                      ],
                    });
                  }}
                />
              </div>
            )}
        </DialogContent>
      </Dialog>
      <Toaster position="bottom-right" richColors closeButton />
    </SidebarProvider>
  );
}
