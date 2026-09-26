import type { JSONContent } from "@tiptap/react";
export type Language = "zh" | "en";
export type Evidence = {
  id: string;
  sourceId: string;
  versionId: string;
  page: number;
  quote: string;
  name: string;
  label: string;
};
export type Draft = {
  paragraphs: { text: string; evidenceIds: string[] }[];
  evidence: Evidence[];
};
export type ResearchTurn = Draft & {
  id: string;
  question: string;
  retrievalQuery: string;
  sourceIds: string[];
  mode: "passages" | "answer";
  status: "answered" | "insufficient" | "conflicting";
  createdAt: string;
  reviewedEvidenceIds?: string[];
};
export type ReadingPosition = {
  sourceId: string;
  versionId: string;
  page: number;
  quote: string;
};
export type ResearchState = {
  question: string;
  selectedSourceIds: string[];
  mode: "passages" | "answer";
  turns: ResearchTurn[];
  followUp?: boolean;
};
export type SourceVersion = {
  id: string;
  text: string;
  pages: { page: number; text: string }[];
  createdAt: string;
  hash: string;
  size: number;
  original?: Blob;
  fileName?: string;
  kind?: "pdf" | "md" | "txt";
};
export type Source = {
  id: string;
  name: string;
  kind: "pdf" | "md" | "txt";
  versions: SourceVersion[];
  color: string;
};
export type Snapshot = {
  id: string;
  title: string;
  content: JSONContent;
  reportTitle: string;
  createdAt: string;
};
export type Project = {
  id: string;
  name: string;
  reportTitle: string;
  description: string;
  content: JSONContent;
  sources: Source[];
  snapshots: Snapshot[];
  createdAt: string;
  updatedAt: string;
  example?: boolean;
  research?: ResearchState;
  reading?: ReadingPosition;
  lastView?: string;
};
export type WorkspaceData = {
  schemaVersion: 1;
  projects: Project[];
  activeId: string;
  language: Language;
  languagePreferenceVersion?: 1;
};
export const uid = () => crypto.randomUUID();
export const textNode = (text: string): JSONContent => ({ type: "text", text });
export const para = (text: string): JSONContent => ({
  type: "paragraph",
  content: text ? [textNode(text)] : undefined,
});
export const heading = (text: string, level = 2): JSONContent => ({
  type: "heading",
  attrs: { level },
  content: [textNode(text)],
});
export function plainText(node: JSONContent): string {
  if (node.type === "citation") return `[${node.attrs?.label || "*"}]`;
  if (node.text) return node.text;
  return (node.content || [])
    .map(plainText)
    .join(
      ["doc", "bulletList", "orderedList"].includes(node.type || "")
        ? "\n\n"
        : "",
    );
}
export function citations(node: JSONContent): JSONContent[] {
  return [
    ...(node.type === "citation" ? [node] : []),
    ...(node.content || []).flatMap(citations),
  ];
}
export function makeProject(name: string, language: Language): Project {
  const now = new Date().toISOString();
  return {
    id: uid(),
    name,
    reportTitle: name,
    description:
      language === "zh"
        ? "从一份资料，一个想法开始。"
        : "Start with a source. Make room for an idea.",
    content: { type: "doc", content: [para("")] },
    sources: [],
    snapshots: [],
    createdAt: now,
    updatedAt: now,
  };
}
export function legacySeedWorkspace(): WorkspaceData {
  const now = new Date().toISOString();
  const q1 =
    "工作方式的变化，不只是地点的迁移，更是个人对时间、工具与协作边界的重新安排。";
  const q2 =
    "在这组虚构访谈里，创作者反复提到的困难是资料散落、上下文丢失，以及无法追溯已经写下的判断。";
  const q3 = "好的工具应让人更容易回到工作本身，而不是要求人持续维护工具。";
  const source = (
    id: string,
    name: string,
    kind: Source["kind"],
    text: string,
    color: string,
  ): Source => ({
    id,
    name,
    kind,
    color,
    versions: [
      {
        id: `${id}-v1`,
        text,
        pages: [{ page: 1, text }],
        createdAt: now,
        hash: "example",
        size: new TextEncoder().encode(text).length,
      },
    ],
  });
  const sources = [
    source(
      "s1",
      "独立工作观察 · 2026",
      "md",
      `示例资料 · 以下为产品演示而创作，不代表真实研究结论。\n\n工作与生活的重新组织\n\n${q1}\n\n独立工作者常常在研究、创作与交付之间切换。一个持续积累的项目，需要保留资料的来路，也需要给个人判断留出空间。\n\n工具的意义不在于制造更多输出，而在于减少重新寻找上下文的成本。`,
      "clay",
    ),
    source(
      "s2",
      "创作者访谈笔记",
      "txt",
      `示例资料 · 以下访谈情境为虚构。\n\n${q2}\n\n情境 A：写作中断后，需要重新打开多个文件才能找回思路。\n情境 B：原始资料更新了，已经交付的报告却没有对应的提示。\n情境 C：AI 帮忙写出了段落，但核对来源反而花了更久。\n\n他们期待一个地方，能够同时容纳原始材料、写作过程与最终成果。`,
      "blue",
    ),
    source(
      "s3",
      "A quieter workspace",
      "md",
      `Demo material, written for this sample project.\n\n${q3}\n\nA useful workspace keeps sources close to ideas. It should make the next action obvious and leave the writer in control.\n\nLocal storage offers ownership; clear exports offer a way out. Neither should require an account before the first useful moment.`,
      "green",
    ),
  ];
  const cite = (
    sourceId: string,
    label: string,
    quote: string,
  ): JSONContent => ({
    type: "citation",
    attrs: { sourceId, versionId: `${sourceId}-v1`, page: 1, label, quote },
  });
  const p = (text: string, c?: JSONContent): JSONContent => ({
    type: "paragraph",
    content: [textNode(text), ...(c ? [c] : [])],
  });
  const content: JSONContent = {
    type: "doc",
    content: [
      heading("工作，正在重新被组织"),
      p(
        "当工作不再由一张固定的办公桌定义，我们开始重新思考：什么值得投入时间，又有哪些过程，可以变得更轻一些。",
      ),
      p(
        "这种变化并不只是从办公室走向咖啡馆。它关乎如何安排一天，如何建立协作，以及如何让零散的信息，逐渐成为自己的判断。",
        cite("s1", "1", q1),
      ),
      { type: "blockquote", content: [p(q3, cite("s3", "3", q3))] },
      heading("从收集信息，到形成自己的观点"),
      p(
        "资料越来越容易获得，真正稀缺的是整理它们的耐心。下载的报告、随手记下的想法、访谈中的一句话，往往留在彼此隔离的地方。",
        cite("s2", "2", q2),
      ),
      p(
        "一个值得继续探索的方向，是把阅读与写作放回同一个空间：让每个关键判断都能回到原文，让修改留下痕迹，也让新的资料有机会改变旧的结论。",
      ),
      heading("留出空间，让想法继续生长"),
      {
        type: "bulletList",
        content: [
          "保留资料的来路，让关键表述有据可循。",
          "保留自己的修改，让工具服务于个人判断。",
          "留意来源的变化，让报告成为可以继续维护的作品。",
        ].map((t) => ({ type: "listItem", content: [p(t)] })),
      },
      p(
        "这份简报是一个起点。接下来，可以继续加入资料，核对引用，或者把这一页改写成你自己的观察。",
      ),
    ],
  };
  const project: Project = {
    id: "welcome",
    name: "独立工作方式研究",
    reportTitle: "独立工作的新秩序",
    description: "关于时间、工具，以及一种更自主的工作方式。",
    content,
    sources,
    snapshots: [],
    createdAt: now,
    updatedAt: now,
    example: true,
  };
  return {
    schemaVersion: 1,
    projects: [project],
    activeId: project.id,
    language: "zh",
  };
}

export function seedWorkspace(): WorkspaceData {
  const data = legacySeedWorkspace();
  const project = data.projects[0];
  const q1 =
    "Independent work is less about where work happens and more about how people choose to use their time, tools and attention.";
  const q2 =
    "In these fictional interviews, creators describe scattered sources, lost context and difficulty tracing the reasoning behind earlier drafts.";
  const q3 =
    "A good tool brings you back to the work, instead of becoming more work to maintain.";
  const sourceCopy = [
    {
      name: "The independent work notebook",
      text: `Fictional sample material, created to demonstrate Folio. This is not published research.\n\n${q1}\n\nIndependent workers move between reading, making and delivering. A lasting project needs to preserve where its ideas came from while leaving room for personal judgment.\n\nThe purpose of a useful tool is to reduce the effort of finding context again.`,
    },
    {
      name: "Conversations with makers",
      text: `Fictional interview notes, created for this sample project.\n\n${q2}\n\nScenario A: Returning to a draft means reopening several files to recover its context.\nScenario B: A source changes, but the completed report gives no indication of the update.\nScenario C: An AI-written paragraph takes longer to verify than to write.\n\nThe imagined participants want to keep evidence, working notes and finished writing together.`,
    },
    {
      name: "A quieter kind of workspace",
      text: `Fictional design notes, created for this sample project.\n\n${q3}\n\nA useful workspace keeps sources close to ideas. The next step should feel obvious, and the writer should stay in control.\n\nLocal storage keeps work close. Clear exports provide a way to take it elsewhere.`,
    },
  ];
  project.sources = project.sources.map((s, i) => ({
    ...s,
    name: sourceCopy[i].name,
    versions: [
      {
        ...s.versions[0],
        text: sourceCopy[i].text,
        pages: [{ page: 1, text: sourceCopy[i].text }],
        size: new TextEncoder().encode(sourceCopy[i].text).length,
      },
    ],
  }));
  const paragraph = (
    text: string,
    sourceId?: string,
    quote?: string,
  ): JSONContent => ({
    type: "paragraph",
    content: [
      { type: "text", text },
      ...(sourceId
        ? [
            {
              type: "citation",
              attrs: {
                sourceId,
                versionId: `${sourceId}-v1`,
                page: 1,
                label: sourceId.slice(1),
                quote,
              },
            },
          ]
        : []),
    ],
  });
  project.name = "Independent work";
  project.reportTitle = "A quieter way to work";
  project.description =
    "Notes on attention, good tools, and making room for your own ideas.";
  project.content = {
    type: "doc",
    content: [
      heading("Work, on your own terms"),
      paragraph(
        "When work is no longer defined by a desk, a different question comes into focus: what deserves our attention, and what can we make a little lighter?",
      ),
      paragraph(
        "The shift is about more than moving from an office to a coffee shop. It asks us to be intentional about our time, our tools, and the way scattered information becomes a point of view.",
        "s1",
        q1,
      ),
      { type: "blockquote", content: [paragraph(q3, "s3", q3)] },
      heading("From collecting to connecting"),
      paragraph(
        "Finding information is often the easy part. A report, a passing observation, a sentence from a conversation — each can be useful, yet each tends to live somewhere different.",
        "s2",
        q2,
      ),
      paragraph(
        "Keeping reading and writing in one place offers a starting point. Every important claim can lead back to its source. Every revision can leave a trace. New evidence can challenge an old conclusion without erasing the thinking that came before it.",
      ),
      heading("Leave room for the next thought"),
      {
        type: "bulletList",
        content: [
          "Keep the original source within reach.",
          "Let suggestions support your judgment.",
          "Revisit a conclusion when its evidence changes.",
        ].map((text) => ({ type: "listItem", content: [paragraph(text)] })),
      },
      paragraph(
        "This is a small beginning. Add a source, follow a citation, or turn this page into an observation of your own.",
      ),
    ],
  };
  return { ...data, language: "en", languagePreferenceVersion: 1 };
}
