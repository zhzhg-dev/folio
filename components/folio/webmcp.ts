"use client";
import { useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import type { Project } from "@/lib/folio/model";
type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown;
};
export function useWebMCP(
  project: Project,
  projects: Project[],
  onOpen: (id: string) => void,
) {
  const current = useRef({ project, projects, onOpen });
  current.current = { project, projects, onOpen };
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: Tool,
            options: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tools: Tool[] = [
      {
        name: "folio_list_projects",
        title: "List Folio projects",
        description:
          "Read the local project's names and IDs, current selection and source counts. Does not modify documents.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: (input) => {
          if (!input || typeof input !== "object" || Object.keys(input).length)
            throw new Error("Expected an empty object");
          return {
            activeId: current.current.project.id,
            projects: current.current.projects.map((p) => ({
              id: p.id,
              name: p.name,
              title: p.reportTitle,
              sourceCount: p.sources.length,
            })),
          };
        },
      },
      {
        name: "folio_open_project",
        title: "Open Folio project",
        description:
          "Navigate to an existing local project and its writing workspace. Does not alter the document or create a project.",
        inputSchema: {
          type: "object",
          properties: { projectId: { type: "string" } },
          required: ["projectId"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        execute: (input) => {
          if (
            !input ||
            typeof input !== "object" ||
            Object.keys(input).some((k) => k !== "projectId")
          )
            throw new Error("Invalid input");
          const id = (input as { projectId?: unknown }).projectId;
          if (
            typeof id !== "string" ||
            !current.current.projects.some((p) => p.id === id)
          )
            throw new Error("Project not found");
          flushSync(() => current.current.onOpen(id));
          return { openedProjectId: id };
        },
      },
    ];
    for (const tool of tools) {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {
        /* Optional browser capability. */
      }
    }
    return () => lifecycle.abort();
  }, []);
}
