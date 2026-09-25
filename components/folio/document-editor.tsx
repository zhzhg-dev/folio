"use client";
import { useEffect } from "react";
import {
  EditorContent,
  useEditor,
  Node,
  mergeAttributes,
  type JSONContent,
  type Editor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
const Citation = Node.create({
  name: "citation",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return {
      sourceId: { default: "" },
      versionId: { default: "" },
      page: { default: 1 },
      quote: { default: "" },
      label: { default: "1" },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-citation]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-citation": "",
        role: "button",
        tabindex: "0",
        class: "citation-pill",
        title: node.attrs.quote,
      }),
      node.attrs.label,
    ];
  },
});
export default function DocumentEditor({
  content,
  projectId,
  onChange,
  onReady,
  onCitation,
  language,
}: {
  content: JSONContent;
  projectId: string;
  onChange: (content: JSONContent) => void;
  onReady: (editor: Editor) => void;
  onCitation: (attrs: Record<string, string>) => void;
  language: string;
}) {
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ link: { openOnClick: false } }),
        Placeholder.configure({
          placeholder:
            language === "zh"
              ? "写下想法，或从右侧资料中引用一段文字…"
              : "Write a thought, or cite something from your sources…",
        }),
        TableKit,
        Citation,
      ],
      content,
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class: "folio-editor",
          "aria-label": language === "zh" ? "报告正文" : "Report content",
        },
        handleClickOn: (_view, _pos, node) => {
          if (node.type.name === "citation") {
            onCitation(node.attrs);
            return true;
          }
          return false;
        },
        handleKeyDown: (_view, event) => {
          const target = event.target as HTMLElement;
          if (
            (event.key === "Enter" || event.key === " ") &&
            target.matches("[data-citation]")
          ) {
            event.preventDefault();
            onCitation({
              sourceId: target.getAttribute("sourceid") || "",
              versionId: target.getAttribute("versionid") || "",
              page: target.getAttribute("page") || "1",
              quote: target.getAttribute("quote") || "",
              label: target.textContent || "1",
            });
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor }) => onChange(editor.getJSON()),
    },
    [],
  );
  useEffect(() => {
    if (editor && !editor.isDestroyed) onReady(editor);
  }, [editor, onReady]);
  useEffect(() => {
    if (
      editor &&
      !editor.isDestroyed &&
      JSON.stringify(editor.getJSON()) !== JSON.stringify(content)
    )
      editor.commands.setContent(content, { emitUpdate: false });
  }, [content, editor]);
  return <EditorContent editor={editor} />;
}
