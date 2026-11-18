import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, ChevronDown, FileText, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { uid, type Language, type Project } from "@/lib/folio/model";
import {
  decisionDefaults,
  decisionSetupLimits,
  validateDecisionSetup,
  type DecisionSetupErrors,
  type DecisionSetupInput,
} from "@/lib/folio/decision-project";
import "@/app/decision-setup.css";

export type DecisionSetupProps = {
  project: Project;
  language?: Language;
  onCreate: (input: DecisionSetupInput) => boolean | Promise<boolean>;
  onCancel?: () => void;
  onSample?: () => void;
};

export default function DecisionSetup(props: DecisionSetupProps) {
  // Changing projects must never carry source assignments across project boundaries.
  return <DecisionSetupForm key={props.project.id} {...props} />;
}

function DecisionSetupForm({
  project,
  language = "en",
  onCreate,
  onCancel,
  onSample,
}: DecisionSetupProps) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const submitting = useRef(false);
  const pendingFocus = useRef<string | null>(null);
  const criteriaEdited = useRef(false);
  const formLanguage = useRef(language);
  const [objective, setObjective] = useState(project.notebook?.objective || "");
  const [options, setOptions] = useState(() =>
    decisionDefaults(language).options.map((option) => ({
      ...option,
      key: uid(),
    })),
  );
  const [criteria, setCriteria] = useState(() =>
    decisionDefaults(language).criteria.map((name) => ({ name, key: uid() })),
  );
  const [criteriaOpen, setCriteriaOpen] = useState(false);
  const [errors, setErrors] = useState<DecisionSetupErrors>({});
  const [saveError, setSaveError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (formLanguage.current === language) return;
    formLanguage.current = language;
    if (!criteriaEdited.current) {
      const defaults = decisionDefaults(language).criteria;
      setCriteria((items) =>
        items.map((item, i) => ({ ...item, name: defaults[i] })),
      );
    }
    setErrors({});
    setSaveError("");
  }, [language]);
  const errorId = (field: string) => `${formId}-${field}-error`;
  const input: DecisionSetupInput = {
    objective,
    options: options.map(({ name, sourceIds }) => ({ name, sourceIds })),
    criteria: criteria.map((criterion) => criterion.name),
  };
  useEffect(() => {
    if (Object.keys(errors).length)
      formRef.current
        ?.querySelector<HTMLElement>('[aria-invalid="true"]')
        ?.focus();
  }, [errors]);
  useEffect(() => {
    if (!pendingFocus.current) return;
    formRef.current
      ?.querySelector<HTMLInputElement>(
        `[data-setup-key="${pendingFocus.current}"]`,
      )
      ?.focus();
    pendingFocus.current = null;
  }, [options, criteria]);
  const clearErrors = () => {
    setErrors({});
    setSaveError("");
  };
  const setOption = (
    key: string,
    patch: Partial<DecisionSetupInput["options"][number]>,
  ) => {
    clearErrors();
    setOptions((items) =>
      items.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  };
  const showError = (field: string) =>
    errors[field] && (
      <p className="decision-setup-error" id={errorId(field)}>
        {errors[field]}
      </p>
    );
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    const found = validateDecisionSetup(project, input, language);
    setErrors(found);
    setSaveError("");
    if (Object.keys(found).length) {
      if (Object.keys(found).some((key) => key.startsWith("criteria")))
        setCriteriaOpen(true);
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      if (!(await onCreate(input)))
        setSaveError(
          t(
            "没有保存成功。你的输入仍保留在这里，请重试。",
            "Setup could not be saved. Your entries are still here; try again.",
          ),
        );
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : t("保存失败，请重试。", "Could not save setup. Try again."),
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="decision-setup" aria-labelledby={`${formId}-title`}>
      <header className="decision-setup-heading">
        <h1 id={`${formId}-title`}>
          {t("从一个决定开始", "Start with a decision")}
        </h1>
        <p>
          {t(
            "把备选方案放在一起，用同一组标准检查资料。",
            "Put your options side by side, then check the evidence against the same criteria.",
          )}
        </p>
        {onSample && (
          <button
            type="button"
            className="decision-sample-link"
            onClick={onSample}
          >
            {t("打开客服软件选型示例", "Explore a support software comparison")}{" "}
            <ArrowUpRight size={14} aria-hidden="true" />
          </button>
        )}
      </header>
      <form ref={formRef} noValidate onSubmit={save} aria-busy={busy}>
        <fieldset className="decision-setup-fields" disabled={busy}>
          <div className="decision-setup-objective">
            <label htmlFor={`${formId}-objective`}>
              {t("这次要做什么决定？", "What are you deciding?")}
            </label>
            <textarea
              id={`${formId}-objective`}
              name="objective"
              rows={2}
              required
              maxLength={decisionSetupLimits.objective}
              placeholder={t(
                "例如：为五人客服团队选择一款共享收件箱",
                "For example: choose a shared inbox for a five-person support team",
              )}
              value={objective}
              onChange={(event) => {
                clearErrors();
                setObjective(event.target.value);
              }}
              aria-invalid={!!errors.objective}
              aria-describedby={
                errors.objective ? errorId("objective") : undefined
              }
            />
            {showError("objective")}
          </div>
          <fieldset className="decision-setup-options">
            <legend>
              {t("比较哪些方案？", "Which options are you considering?")}
            </legend>
            <p className="decision-setup-hint">
              {t(
                "添加 2 至 6 个方案，并为它们选择相关资料。",
                "Add 2–6 options and choose the sources that belong to each.",
              )}
            </p>
            {showError("options")}
            <div className="decision-setup-option-list">
              {options.map((option, index) => {
                const nameField = `options.${index}.name`;
                const sourcesField = `options.${index}.sourceIds`;
                const sourceCount = option.sourceIds.length;
                return (
                  <div className="decision-setup-option" key={option.key}>
                    <div className="decision-setup-option-name">
                      <label htmlFor={`${formId}-${option.key}`}>
                        {t("方案", "Option")} {index + 1}
                      </label>
                      <div className="decision-setup-input-row">
                        <Input
                          id={`${formId}-${option.key}`}
                          data-setup-key={option.key}
                          name={`option-${index + 1}`}
                          value={option.name}
                          placeholder={t(
                            "产品、服务或方案名称",
                            "Product, service, or approach",
                          )}
                          maxLength={decisionSetupLimits.name}
                          required
                          onChange={(event) =>
                            setOption(option.key, { name: event.target.value })
                          }
                          aria-invalid={!!errors[nameField]}
                          aria-describedby={
                            errors[nameField] ? errorId(nameField) : undefined
                          }
                        />
                        {options.length > decisionSetupLimits.minOptions && (
                          <button
                            type="button"
                            className="decision-setup-remove"
                            aria-label={
                              t("移除方案：", "Remove option: ") +
                              (option.name || String(index + 1))
                            }
                            onClick={() => {
                              clearErrors();
                              pendingFocus.current =
                                options[index + 1]?.key ||
                                options[index - 1]?.key ||
                                null;
                              setOptions((items) =>
                                items.filter((item) => item.key !== option.key),
                              );
                            }}
                          >
                            <X size={16} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                      {showError(nameField)}
                    </div>
                    <details
                      className="decision-setup-sources"
                      open={errors[sourcesField] ? true : undefined}
                    >
                      <summary
                        aria-invalid={!!errors[sourcesField]}
                        aria-describedby={
                          errors[sourcesField]
                            ? errorId(sourcesField)
                            : undefined
                        }
                      >
                        <FileText size={15} aria-hidden="true" />
                        <span>
                          {sourceCount
                            ? t(
                                `已选 ${sourceCount} 份资料`,
                                `${sourceCount} ${sourceCount === 1 ? "source" : "sources"} selected`,
                              )
                            : t("选择资料", "Choose sources")}
                        </span>
                        <ChevronDown size={14} aria-hidden="true" />
                      </summary>
                      <div className="decision-setup-source-picker">
                        {project.sources.length ? (
                          <fieldset>
                            <legend className="sr-only">
                              {t("关联到方案的资料：", "Sources for option: ") +
                                (option.name || String(index + 1))}
                            </legend>
                            {project.sources.map((source) => (
                              <label key={source.id}>
                                <input
                                  type="checkbox"
                                  checked={option.sourceIds.includes(source.id)}
                                  disabled={
                                    !option.sourceIds.includes(source.id) &&
                                    sourceCount >=
                                      decisionSetupLimits.sourcesPerOption
                                  }
                                  onChange={(event) =>
                                    setOption(option.key, {
                                      sourceIds: event.target.checked
                                        ? [...option.sourceIds, source.id]
                                        : option.sourceIds.filter(
                                            (id) => id !== source.id,
                                          ),
                                    })
                                  }
                                />
                                <span>{source.name}</span>
                              </label>
                            ))}
                          </fieldset>
                        ) : (
                          <p className="decision-setup-hint">
                            {t(
                              "建立比较后，可以添加资料，再关联到对应方案。",
                              "After setup, add sources and link them to the relevant options in the comparison.",
                            )}
                          </p>
                        )}
                        {sourceCount > 0 && (
                          <button
                            type="button"
                            className="decision-setup-text-action"
                            onClick={() =>
                              setOption(option.key, { sourceIds: [] })
                            }
                          >
                            {t("清除所选资料", "Clear selected sources")}
                          </button>
                        )}
                      </div>
                    </details>
                    {showError(sourcesField)}
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              className="decision-setup-add"
              disabled={options.length >= decisionSetupLimits.options}
              onClick={() => {
                clearErrors();
                const key = uid();
                pendingFocus.current = key;
                setOptions((items) => [
                  ...items,
                  { key, name: "", sourceIds: [] },
                ]);
              }}
            >
              <Plus size={16} aria-hidden="true" />
              {t("添加方案", "Add option")}
            </button>
          </fieldset>
          <details
            className="decision-setup-criteria"
            open={criteriaOpen}
            onToggle={(event) => setCriteriaOpen(event.currentTarget.open)}
          >
            <summary>
              <span>
                <strong>
                  {t("按什么标准比较？", "What matters to this decision?")}
                </strong>
                <span>
                  {criteria
                    .map((criterion) => criterion.name.trim())
                    .filter(Boolean)
                    .join(" / ") ||
                    t("添加比较维度", "Add comparison criteria")}
                </span>
              </span>
              <ChevronDown size={17} aria-hidden="true" />
            </summary>
            <fieldset>
              <legend className="sr-only">
                {t("比较维度", "Comparison criteria")}
              </legend>
              <p className="decision-setup-hint">
                {t(
                  "修改这些维度，让每个方案回答同样的问题。最多 12 项。",
                  "Edit these criteria so every option answers the same questions. Up to 12.",
                )}
              </p>
              {showError("criteria")}
              {criteria.map((criterion, index) => (
                <div className="decision-setup-criterion" key={criterion.key}>
                  <label
                    className="sr-only"
                    htmlFor={`${formId}-${criterion.key}`}
                  >
                    {t("比较维度", "Criterion")} {index + 1}
                  </label>
                  <div className="decision-setup-input-row">
                    <Input
                      id={`${formId}-${criterion.key}`}
                      data-setup-key={criterion.key}
                      value={criterion.name}
                      maxLength={decisionSetupLimits.name}
                      required
                      onChange={(event) => {
                        clearErrors();
                        criteriaEdited.current = true;
                        setCriteria((items) =>
                          items.map((item) =>
                            item.key === criterion.key
                              ? { ...item, name: event.target.value }
                              : item,
                          ),
                        );
                      }}
                      aria-invalid={!!errors[`criteria.${index}`]}
                      aria-describedby={
                        errors[`criteria.${index}`]
                          ? errorId(`criteria.${index}`)
                          : undefined
                      }
                    />
                    <button
                      type="button"
                      className="decision-setup-remove"
                      disabled={criteria.length <= 1}
                      aria-label={
                        t("移除维度：", "Remove criterion: ") +
                        (criterion.name || String(index + 1))
                      }
                      onClick={() => {
                        clearErrors();
                        criteriaEdited.current = true;
                        pendingFocus.current =
                          criteria[index + 1]?.key ||
                          criteria[index - 1]?.key ||
                          null;
                        setCriteria((items) =>
                          items.filter((item) => item.key !== criterion.key),
                        );
                      }}
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                  </div>
                  {showError(`criteria.${index}`)}
                </div>
              ))}
              <button
                type="button"
                className="decision-setup-add"
                disabled={criteria.length >= decisionSetupLimits.criteria}
                onClick={() => {
                  clearErrors();
                  const key = uid();
                  pendingFocus.current = key;
                  criteriaEdited.current = true;
                  setCriteria((items) => [...items, { key, name: "" }]);
                }}
              >
                <Plus size={16} aria-hidden="true" />
                {t("添加维度", "Add criterion")}
              </button>
            </fieldset>
          </details>
        </fieldset>
        {(Object.keys(errors).length > 0 || saveError) && (
          <p
            className="decision-setup-error decision-setup-form-error"
            role="alert"
          >
            {saveError ||
              errors.project ||
              errors.form ||
              t(
                "请检查标出的字段，输入会保留。",
                "Check the highlighted fields. Your entries are kept.",
              )}
          </p>
        )}
        <footer className="decision-setup-footer">
          <p>
            {project.sources.length
              ? t(
                  "资料分配和比较维度随时可以修改。",
                  "You can change source assignments and criteria later.",
                )
              : t(
                  "可以先建立比较，稍后添加并分配资料。",
                  "Start now. Add and assign your sources in the comparison later.",
                )}
          </p>
          <div>
            {onCancel && (
              <button
                type="button"
                className="decision-setup-text-action"
                disabled={busy}
                onClick={onCancel}
              >
                {t("取消", "Cancel")}
              </button>
            )}
            <button
              className="primary-button"
              type="submit"
              disabled={busy || project.comparison !== undefined}
            >
              {busy
                ? t("正在建立…", "Creating…")
                : t("建立比较", "Create comparison")}
            </button>
          </div>
        </footer>
      </form>
    </section>
  );
}
