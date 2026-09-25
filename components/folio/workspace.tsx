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
} from "@/lib/folio/model";
import { loadWorkspace, saveWorkspace } from "@/lib/folio/storage";
import DocumentEditor from "./document-editor";
import FeatureDialog from "./feature-dialog";
import SourceDetail from "./source-detail";
import Assistant from "./assistant";
import ReviewView from "./review-view";
import {
  exportMarkdown,
  exportWord,
  exportHtml,
  exportBackup,
} from "@/lib/folio/files";
import { countChanges, citationStatus } from "@/lib/folio/integrity";
import type { Draft } from "@/lib/folio/ai";
import { useWebMCP } from "./webmcp";

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

export default function Workspace() {
  const [data, setData] = useState<WorkspaceData>(seedWorkspace);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState("saved");
  const [view, setView] = useState("editor");
  const [rightOpen, setRightOpen] = useState(true);
  const [focus, setFocus] = useState(false);
  const [dialog, setDialog] = useState<string | null>(null);
  const dialogRef = useRef<string | null>(null);
  if (dialog) dialogRef.current = dialog;
  const dialogKind = dialog || dialogRef.current;
  const [newName, setNewName] = useState("");
  const [query, setQuery] = useState("");
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [selectedQuote, setSelectedQuote] = useState("");
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [updateSourceId, setUpdateSourceId] = useState<string | null>(null);
  const [replacing, setReplacing] = useState<Record<string, string> | null>(
    null,
  );
  const [editor, setEditor] = useState<Editor | null>(null);
  const saveChain = useRef(Promise.resolve());
  const project =
    data.projects.find((p) => p.id === data.activeId) || data.projects[0];
  const t = useCallback(
    (zh: string, en: string) => (data.language === "zh" ? zh : en),
    [data.language],
  );
  const onReady = useCallback((e: Editor) => setEditor(e), []);
  useEffect(() => {
    loadWorkspace()
      .then((v) => {
        setData(v);
        setLoaded(true);
      })
      .catch(() => {
        toast.error("无法读取本地数据，请检查浏览器存储权限");
        setSaving("error");
      });
  }, []);
  useEffect(() => {
    if (!loaded) return;
    setSaving("saving");
    const timeout = setTimeout(() => {
      saveChain.current = saveChain.current
        .catch(() => {})
        .then(() => saveWorkspace(data))
        .then(() => setSaving("saved"))
        .catch((error: unknown) => {
          setSaving("error");
          toast.error(
            error instanceof Error
              ? error.message
              : t(
                  "保存失败，请导出备份",
                  "Save failed. Please export a backup.",
                ),
          );
        });
    }, 450);
    return () => clearTimeout(timeout);
  }, [data, loaded, t]);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1100px)");
    const change = () => setRightOpen(media.matches);
    change();
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    document.documentElement.lang = data.language === "zh" ? "zh-CN" : "en";
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
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [saving]);
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
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
  const openSource = (source: Source, quote = "", versionId = "") => {
    setSelectedSource(source);
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
      setView("review");
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
      updateProject({ sources: [...project.sources, ...unique] });
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
  const adoptDraft = (draft: Draft) => {
    if (
      draft.evidence.some(
        (e) =>
          !project.sources
            .find((s) => s.id === e.sourceId)
            ?.versions.slice(-1)
            .some((v) => v.id === e.versionId && v.text.includes(e.quote)),
      )
    ) {
      toast.error(
        t("资料已变化，请重新生成", "Sources changed. Generate a new draft."),
      );
      return;
    }
    const nodes = draft.paragraphs.map((p) => ({
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
              label: e.label,
            },
          };
        }),
      ],
    }));
    updateProject({
      content: {
        ...project.content,
        content: [...(project.content.content || []), ...nodes],
      },
      snapshots: [
        snapshot(t("采用 AI 草稿之前", "Before accepting AI draft")),
        ...project.snapshots,
      ],
    });
    toast.success(
      t(
        "草稿已追加，原有正文已保留",
        "Draft appended. Your existing writing is preserved.",
      ),
    );
  };
  const runExport = async (format: "word" | "html" | "backup") => {
    try {
      if (format === "word") await exportWord(project);
      if (format === "html") exportHtml(project);
      if (format === "backup") await exportBackup(project);
      toast.success(t("导出完成", "Export complete"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
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
  const wordCount = plainText(project.content).replace(/\s/g, "").length;
  const createProject = () => {
    if (!newName.trim()) return;
    const next = makeProject(newName.trim(), data.language);
    setData((current) => ({
      ...current,
      projects: [...current.projects, next],
      activeId: next.id,
    }));
    setNewName("");
    setDialog(null);
    setSelectedSource(null);
    setView("editor");
  };
  const downloadMarkdown = () => {
    exportMarkdown(project);
    toast.success(t("已导出 Markdown", "Markdown exported"));
  };
  const formatting = [
    {
      Icon: Bold,
      label: "加粗 / Bold",
      run: () => editor?.chain().focus().toggleBold().run(),
    },
    {
      Icon: Italic,
      label: "斜体 / Italic",
      run: () => editor?.chain().focus().toggleItalic().run(),
    },
    {
      Icon: List,
      label: "项目列表 / Bullet list",
      run: () => editor?.chain().focus().toggleBulletList().run(),
    },
    {
      Icon: ListOrdered,
      label: "有序列表 / Numbered list",
      run: () => editor?.chain().focus().toggleOrderedList().run(),
    },
    {
      Icon: Quote,
      label: "引用段落 / Block quote",
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
            : "正在打开工作空间 / Opening your workspace"}
        </p>
      </main>
    );
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "232px" } as React.CSSProperties}
      className={`folio-app ${focus ? "is-focused" : ""}`}
    >
      <Sidebar className="folio-sidebar" collapsible="offcanvas">
        <SidebarHeader className="brand-area">
          <button
            className="brand"
            onClick={() => {
              setView("editor");
              setFocus(false);
            }}
          >
            <span className="brand-mark">
              <BookOpen size={20} strokeWidth={1.7} />
            </span>
            <span>
              folio<span className="brand-period">.</span>
            </span>
          </button>
          <button className="workspace-switch" onClick={() => setDialog("new")}>
            <span className="workspace-avatar">F</span>
            {t("个人工作空间", "Personal workspace")}
            <ChevronDown size={14} />
          </button>
        </SidebarHeader>
        <NavigationContent>
          <button className="search-button" onClick={() => setDialog("search")}>
            <Search size={16} />
            <span>{t("快速查找", "Quick search")}</span>
            <kbd>⌘ K</kbd>
          </button>
          <nav className="main-nav" aria-label={t("主导航", "Main navigation")}>
            <button
              className={view === "editor" ? "active" : ""}
              onClick={() => setView("editor")}
            >
              <FileText size={18} />
              {t("写作工作台", "Workspace")}
              <span className="nav-dot" />
            </button>
            <button
              className={view === "library" ? "active" : ""}
              onClick={() => setView("library")}
            >
              <FolderOpen size={18} />
              {t("资料库", "Sources")}
              <span className="nav-count">{project.sources.length}</span>
            </button>
            <button
              className={view === "history" ? "active" : ""}
              onClick={() => setView("history")}
            >
              <Clock3 size={18} />
              {t("版本记录", "Version history")}
            </button>
            <button
              className={view === "review" ? "active" : ""}
              onClick={() => setView("review")}
            >
              <ShieldCheck size={18} />
              {t("来源检查", "Source review")}
              {countChanges(project) > 0 && (
                <span className="changes-count">{countChanges(project)}</span>
              )}
            </button>
          </nav>
          <div className="sidebar-label">
            <span>{t("我的项目", "PROJECTS")}</span>
            <button
              aria-label={t("新建项目", "New project")}
              onClick={() => setDialog("new")}
            >
              <Plus size={15} />
            </button>
          </div>
          <div className="project-list">
            {data.projects.map((p) => (
              <button
                key={p.id}
                className={p.id === project.id ? "selected" : ""}
                onClick={() => {
                  setData((d) => ({ ...d, activeId: p.id }));
                  setSelectedSource(null);
                  setView("editor");
                }}
              >
                <span className="project-dot" />
                <span>{p.name}</span>
                {p.id === project.id && <ChevronDown size={13} />}
              </button>
            ))}
          </div>
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
              <strong>{t("留在你的设备上", "On your device")}</strong>
              <span>
                {t(
                  "私密、自在，无需登录",
                  "Private. Yours. No account needed.",
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
              <small>{t("本地模式", "Local mode")}</small>
            </span>
            <Settings2 size={17} />
          </button>
        </SidebarFooter>
      </Sidebar>
      <main className="workspace-main">
        <header className="topbar">
          <div className="breadcrumbs">
            <SidebarTrigger className="sidebar-toggle" />
            <span>{t("工作空间", "Workspace")}</span>
            <ChevronRight size={13} />
            <strong>{project.name}</strong>
            {project.example && (
              <span className="example-label">{t("示例", "Example")}</span>
            )}
          </div>
          <div className="top-actions">
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
                <button className="export-button">
                  <Download size={15} />
                  {t("导出", "Export")}
                  <ChevronDown size={13} />
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
        {view === "editor" ? (
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
                {formatting.map(({ Icon, label, run }) => (
                  <button
                    key={label}
                    title={label}
                    aria-label={label}
                    onClick={run}
                  >
                    <Icon size={16} />
                  </button>
                ))}
                <i />
                <button
                  aria-label={t("撤销", "Undo")}
                  title="Undo"
                  onClick={() => editor?.chain().focus().undo().run()}
                >
                  <Undo2 size={16} />
                </button>
                <button
                  aria-label={t("重做", "Redo")}
                  title="Redo"
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
                >
                  <Maximize2 size={16} />
                </button>
                <button
                  onClick={() => setRightOpen(!rightOpen)}
                  title={t("参考资料面板", "Sources panel")}
                  aria-label={t("参考资料面板", "Sources panel")}
                >
                  {rightOpen ? (
                    <PanelRightClose size={17} />
                  ) : (
                    <PanelRightOpen size={17} />
                  )}
                </button>
              </div>
            </div>
            <div className="work-area">
              <div className="document-scroll">
                <article className="paper">
                  <div className="document-eyebrow">
                    <span className="document-type">
                      <span />
                      {t("研究简报", "RESEARCH NOTE")}
                    </span>
                    <span className="draft-label">{t("草稿", "Draft")}</span>
                    <button
                      aria-label={t("文档设置", "Document settings")}
                      onClick={() => setDialog("document")}
                    >
                      <MoreHorizontal size={20} />
                    </button>
                  </div>
                  <input
                    className="document-title"
                    aria-label={t("报告标题", "Report title")}
                    value={project.reportTitle}
                    onChange={(e) =>
                      updateProject({ reportTitle: e.target.value })
                    }
                  />
                  <input
                    className="document-description"
                    aria-label={t("报告简介", "Report description")}
                    value={project.description}
                    onChange={(e) =>
                      updateProject({ description: e.target.value })
                    }
                  />
                  <div className="document-meta">
                    <span className="author-avatar">F</span>
                    <span>{t("我的文档", "My document")}</span>
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
                      {Math.max(1, Math.ceil(wordCount / 400))}
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
                  <Tabs defaultValue="sources">
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
                            <span>
                              {t("这个项目里的资料", "IN THIS PROJECT")}
                            </span>
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
                                onClick={() => openSource(s)}
                              >
                                <div className={`source-file-icon ${s.color}`}>
                                  <FileText size={19} />
                                </div>
                                <div>
                                  <strong>{s.name}</strong>
                                  <span>
                                    {s.kind.toUpperCase()}
                                    <span>·</span>
                                    {t("文本资料", "Text source")}
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
                      <Assistant
                        key={project.id}
                        project={project}
                        language={data.language}
                        onAdopt={adoptDraft}
                      />
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
                {wordCount.toLocaleString()} {t("字", "characters")}
                <i /> {project.sources.length} {t("份资料", "sources")}
                <i />
                {t("中文 / EN", "EN / 中文")}
              </span>
            </footer>
          </>
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
                    ? "YOUR KNOWLEDGE, TOGETHER"
                    : "EVERY THOUGHT HAS A HISTORY"}
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
              {dialogKind === "new"
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
                setView("editor");
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
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t(
                  "例如：下一份研究简报",
                  "e.g. Your next research note",
                )}
              />
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
      <Toaster position="bottom-right" richColors closeButton />
    </SidebarProvider>
  );
}
