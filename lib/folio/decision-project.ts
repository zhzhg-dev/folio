import { uid, type Language, type Project } from "./model.ts";
import { comparisonLimits, validComparison } from "./comparison.ts";
import { connectComparisonFindings } from "./conclusions.ts";

export type DecisionSetupInput = {
  objective: string;
  options: { name: string; sourceIds: string[] }[];
  criteria: string[];
};
export type DecisionSetupErrors = Record<string, string>;
export const decisionSetupLimits = {
  objective: 1000,
  name: 200,
  minOptions: 2,
  options: comparisonLimits.options,
  criteria: comparisonLimits.criteria,
  sourcesPerOption: 20,
};

export function decisionDefaults(
  language: Language = "en",
): DecisionSetupInput {
  return {
    objective: "",
    options: [
      { name: "", sourceIds: [] },
      { name: "", sourceIds: [] },
    ],
    criteria:
      language === "zh"
        ? ["成本与计费", "需求匹配", "限制与风险"]
        : ["Cost & billing", "Fit for our needs", "Limits & risks"],
  };
}

const cleanName = (value: string) => value.trim().replace(/\s+/gu, " ");
const nameKey = (value: string) =>
  cleanName(value).normalize("NFKC").toLowerCase();

/** Field errors are shared by the form and the atomic project builder. */
export function validateDecisionSetup(
  project: Project,
  input: DecisionSetupInput,
  language: Language = "en",
): DecisionSetupErrors {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const errors: DecisionSetupErrors = {};
  if (project.comparison !== undefined)
    errors.project = t(
      "这个项目已有比较，请继续编辑现有比较。",
      "This project already has a comparison. Continue editing that comparison.",
    );
  else if (project.archivedAt || project.deletedAt)
    errors.project = t(
      "请先恢复这个项目，再建立比较。",
      "Restore this project before setting up a comparison.",
    );
  if (!input || typeof input !== "object") {
    errors.form = t(
      "请填写决策目标、方案和比较维度。",
      "Enter a decision, its options, and comparison criteria.",
    );
    return errors;
  }
  if (typeof input.objective !== "string" || !input.objective.trim())
    errors.objective = t(
      "写下这次需要做出的决定。",
      "Describe the decision you need to make.",
    );
  else if (input.objective.trim().length > decisionSetupLimits.objective)
    errors.objective = t(
      "决策目标请控制在 1,000 字以内。",
      "Keep the decision under 1,000 characters.",
    );

  if (
    !Array.isArray(input.options) ||
    input.options.length < 2 ||
    input.options.length > decisionSetupLimits.options
  )
    errors.options = t(
      "请添加 2 至 6 个方案。",
      "Add between 2 and 6 options.",
    );
  if (Array.isArray(input.options)) {
    const names = new Map<string, number>();
    Array.from(input.options).forEach((option, index) => {
      const field = `options.${index}.name`;
      if (!option || typeof option.name !== "string" || !cleanName(option.name))
        errors[field] = t("为这个方案命名。", "Give this option a name.");
      else if (cleanName(option.name).length > decisionSetupLimits.name)
        errors[field] = t(
          "方案名称请控制在 200 字以内。",
          "Keep option names under 200 characters.",
        );
      else {
        const key = nameKey(option.name);
        const duplicate = names.get(key);
        if (duplicate !== undefined) {
          const message = t(
            "使用不同的方案名称，便于区分。",
            "Use a different name for each option.",
          );
          errors[field] = message;
          errors[`options.${duplicate}.name`] = message;
        } else names.set(key, index);
      }
      if (
        !option ||
        !Array.isArray(option.sourceIds) ||
        option.sourceIds.length > decisionSetupLimits.sourcesPerOption ||
        new Set(option.sourceIds).size !== option.sourceIds.length ||
        option.sourceIds.some(
          (id) =>
            typeof id !== "string" ||
            !id ||
            id.length > 200 ||
            !project.sources.some((source) => source.id === id),
        )
      )
        errors[`options.${index}.sourceIds`] = t(
          "选择这个项目中现有的资料，每个方案最多 20 份。请取消已经移除的资料。",
          "Choose up to 20 existing project sources per option. Deselect any source that was removed.",
        );
    });
  }
  if (
    !Array.isArray(input.criteria) ||
    input.criteria.length < 1 ||
    input.criteria.length > decisionSetupLimits.criteria
  )
    errors.criteria = t(
      "请保留 1 至 12 个比较维度。",
      "Keep between 1 and 12 comparison criteria.",
    );
  if (Array.isArray(input.criteria)) {
    const names = new Map<string, number>();
    Array.from(input.criteria).forEach((criterion, index) => {
      const field = `criteria.${index}`;
      if (typeof criterion !== "string" || !cleanName(criterion))
        errors[field] = t(
          "填写比较维度，或移除这一项。",
          "Name this criterion or remove it.",
        );
      else if (cleanName(criterion).length > decisionSetupLimits.name)
        errors[field] = t(
          "比较维度请控制在 200 字以内。",
          "Keep criteria under 200 characters.",
        );
      else {
        const key = nameKey(criterion);
        const duplicate = names.get(key);
        if (duplicate !== undefined) {
          const message = t(
            "每个比较维度只保留一次。",
            "Include each criterion only once.",
          );
          errors[field] = message;
          errors[`criteria.${duplicate}`] = message;
        } else names.set(key, index);
      }
    });
  }
  return errors;
}

/** Adds structure only. Evidence, findings, reviews, and brief text remain authored by the user. */
export function buildDecisionProject(
  project: Project,
  input: DecisionSetupInput,
  language: Language = "en",
): Project {
  const errors = validateDecisionSetup(project, input, language);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  const comparison = {
    findingsLinked: true,
    objective: input.objective.trim(),
    constraints: "",
    options: input.options.map((option) => ({
      id: uid(),
      name: cleanName(option.name),
      sourceIds: [...option.sourceIds],
    })),
    criteria: input.criteria.map((name) => ({
      id: uid(),
      name: cleanName(name),
    })),
    cells: [],
    recommendation: "",
    limitations: "",
  };
  if (!validComparison(comparison))
    throw new Error(
      language === "zh"
        ? "比较设置无效，请检查输入。"
        : "Check the comparison setup and try again.",
    );
  const next = connectComparisonFindings({ ...project, comparison });
  return {
    ...next,
    // With no cells yet, connection must not migrate independent notebook data.
    ...(project.notebook === undefined ? {} : { notebook: project.notebook }),
    lastView: "comparison",
  };
}
