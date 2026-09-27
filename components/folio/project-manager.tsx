"use client";
import { useState, useRef, useEffect } from "react";
import {
  Archive,
  ArrowUpRight,
  BookOpen,
  MoreHorizontal,
  RotateCcw,
  Search,
  Star,
  Trash2,
  Download,
  Pencil,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import type { Project, Language } from "@/lib/folio/model";
import type { ProjectAction } from "@/lib/folio/projects";
import { exportBackup } from "@/lib/folio/files";
import { errorMessage } from "@/lib/folio/i18n";

export default function ProjectManager({
  projects,
  activeId,
  language,
  onOpen,
  onAction,
  onNew,
}: {
  projects: Project[];
  activeId: string;
  language: Language;
  onOpen: (id: string) => void;
  onAction: (id: string, action: ProjectAction, name?: string) => void;
  onNew: () => void;
}) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const [section, setSection] = useState("active");
  const [search, setSearch] = useState("");
  const [renaming, setRenaming] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const backupJob = useRef<AbortController | null>(null);
  useEffect(() => () => backupJob.current?.abort(), []);
  const [notice, setNotice] = useState("");
  const filtered = projects
    .filter(
      (p) =>
        (section === "trash"
          ? !!p.deletedAt
          : section === "archived"
            ? !!p.archivedAt && !p.deletedAt
            : !p.archivedAt && !p.deletedAt) &&
        `${p.name} ${p.reportTitle}`
          .toLocaleLowerCase()
          .includes(search.trim().toLocaleLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(!!b.favorite) - Number(!!a.favorite) ||
        (b.lastOpenedAt || b.updatedAt).localeCompare(
          a.lastOpenedAt || a.updatedAt,
        ),
    );
  const action = (p: Project, value: ProjectAction) => {
    onAction(p.id, value);
    if (value !== "favorite")
      setNotice(
        value === "trash"
          ? t(
              "已移至回收站，可随时恢复。",
              "Moved to Trash. You can restore it at any time.",
            )
          : value === "archive"
            ? t(
                "项目已归档，资料与历史均已保留。",
                "Project archived. Sources and history are retained.",
              )
            : t("项目已恢复至当前项目。", "Project restored to Active."),
      );
  };
  return (
    <div className="project-manager">
      <div className="project-manager-toolbar">
        <div className="project-manager-search">
          <Search size={16} />
          <input
            aria-label={t("搜索项目", "Search projects")}
            placeholder={t("搜索项目…", "Search projects…")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="secondary-button" onClick={onNew}>
          {t("新建项目", "New project")}
        </button>
      </div>
      <Tabs
        value={section}
        onValueChange={(value) => {
          setSection(value);
          setNotice("");
          setRenaming("");
        }}
      >
        <TabsList className="project-manager-tabs">
          <TabsTrigger value="active">{t("当前项目", "Active")}</TabsTrigger>
          <TabsTrigger value="archived">{t("已归档", "Archived")}</TabsTrigger>
          <TabsTrigger value="trash">{t("回收站", "Trash")}</TabsTrigger>
        </TabsList>
      </Tabs>
      {section === "trash" && (
        <p className="small-copy">
          {t(
            "项目保留在本机，不会自动清空。恢复会保留原资料、引用与版本记录。",
            "Projects stay on this device until restored. Trash is never automatically emptied; sources, citations and history are retained.",
          )}
        </p>
      )}
      <div className="managed-projects">
        {filtered.map((p) => (
          <div className="managed-project" key={p.id}>
            <BookOpen className="managed-project-icon" size={18} />
            <div className="managed-project-content">
              {renaming === p.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    onAction(p.id, "rename", name);
                    setRenaming("");
                  }}
                  className="project-rename"
                >
                  <input
                    autoFocus
                    aria-label={t("项目名称", "Project name")}
                    value={name}
                    maxLength={160}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <button type="submit" disabled={!name.trim()}>
                    {t("保存", "Save")}
                  </button>
                  <button type="button" onClick={() => setRenaming("")}>
                    {t("取消", "Cancel")}
                  </button>
                </form>
              ) : (
                <button
                  className="managed-project-title"
                  disabled={!!p.archivedAt || !!p.deletedAt}
                  onClick={() => onOpen(p.id)}
                >
                  {p.name}
                  {p.id === activeId && <span>{t("已打开", "Open")}</span>}
                </button>
              )}
              <p>
                {p.sources.length}{" "}
                {t("份资料", p.sources.length === 1 ? "source" : "sources")}
                <span>·</span>
                {t("编辑于 ", "Edited ")}
                {new Date(p.updatedAt).toLocaleDateString(
                  language === "zh" ? "zh-CN" : "en",
                  { month: "short", day: "numeric", year: "numeric" },
                )}
              </p>
            </div>
            {section === "active" ? (
              <button
                className={`icon-button project-star ${p.favorite ? "is-favorite" : ""}`}
                aria-label={`${p.favorite ? t("取消收藏", "Unfavorite") : t("收藏", "Favorite")} ${p.name}`}
                aria-pressed={!!p.favorite}
                onClick={() => action(p, "favorite")}
              >
                <Star size={17} />
              </button>
            ) : (
              <button
                className="secondary-button"
                onClick={() => action(p, "restore")}
              >
                <RotateCcw size={14} />
                {t("恢复", "Restore")}
              </button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="icon-button"
                  aria-label={`${t("项目操作", "Actions for")} ${p.name}`}
                >
                  <MoreHorizontal size={18} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {section === "active" && (
                  <>
                    <DropdownMenuItem onClick={() => onOpen(p.id)}>
                      <ArrowUpRight size={15} />
                      {t("打开项目", "Open project")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setRenaming(p.id);
                        setName(p.name);
                      }}
                    >
                      <Pencil size={15} />
                      {t("重命名", "Rename")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => action(p, "archive")}>
                      <Archive size={15} />
                      {t("归档", "Archive")}
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuItem
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const controller = new AbortController();
                      backupJob.current = controller;
                      await exportBackup(p, { signal: controller.signal });
                      setNotice(
                        t(
                          "备份已准备好，请保存文件。",
                          "Backup ready. Save the file below.",
                        ),
                      );
                    } catch (error) {
                      setNotice(errorMessage(error, language));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Download size={15} />
                  {t("导出备份", "Export backup")}
                </DropdownMenuItem>
                {section !== "trash" && (
                  <DropdownMenuItem onClick={() => action(p, "trash")}>
                    <Trash2 size={15} />
                    {t("移至回收站", "Move to Trash")}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
        {!filtered.length && (
          <div className="project-manager-empty">
            <BookOpen size={24} />
            <p>
              {search
                ? t("没有匹配的项目", "No matching projects")
                : section === "trash"
                  ? t("回收站为空", "Trash is empty")
                  : section === "archived"
                    ? t("暂无归档项目", "No archived projects")
                    : t("暂无项目", "No projects yet")}
            </p>
          </div>
        )}
      </div>
      <p className="project-manager-notice" role="status">
        {notice ||
          t(
            "收藏的项目优先显示，其余按最近访问排序。",
            "Favorites first, then recently opened.",
          )}
      </p>
    </div>
  );
}
