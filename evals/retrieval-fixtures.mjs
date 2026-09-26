import { makeProject } from "../lib/folio/model.ts";

// Fictional, manually labeled development cases. Not a general accuracy benchmark.
export function fixtureProject() {
  const p = makeProject("Research evaluation", "en");
  const docs = [
    [
      "plan",
      "Atlas plan.txt",
      [
        "Project Atlas will launch on 15 October 2026.",
        "The subscription price is 12 dollars per month.",
        "The annual budget is 4800 dollars.",
        "The support email is help@example.test.",
      ],
    ],
    [
      "revision",
      "Atlas revision.txt",
      [
        "The revised subscription price is 18 dollars per month. This replaces the earlier 12 dollar estimate.",
        "The annual budget is now 7200 dollars, replacing the previous 4800 dollar budget.",
      ],
    ],
    [
      "privacy",
      "Data handling.txt",
      [
        "Imported files are stored locally on the device. They are never uploaded to a server.",
        "Backup exports are not encrypted. Keep backup files somewhere private.",
        "Activity records are retained for 30 days, then deleted.",
      ],
    ],
    [
      "cn",
      "中文计划.txt",
      [
        "项目支持中文和英文，面向独立研究者。",
        "每月订阅价格为人民币八十元。",
        "正式发布时间是十月十五日。",
        "主要风险是网络中断。",
        "备份文件没有加密。活动记录保留三十天。",
      ],
    ],
    ["team-a", "Team A.txt", ["The approved launch date is 2 November 2026."]],
    ["team-b", "Team B.txt", ["The approved launch date is 9 November 2026."]],
    [
      "appendix",
      "Operations.txt",
      [
        "Routine operating notes. ".repeat(150) +
          "\n\nEmergency recovery code: SILVER-PINE-72.\n\n" +
          "Routine operating notes. ".repeat(150),
      ],
    ],
  ];
  p.sources = docs.map(([id, name, texts]) => ({
    id,
    name,
    kind: "txt",
    color: "green",
    versions: [
      {
        id: id + "-v1",
        text: texts.join("\n\n"),
        pages: texts.map((text, i) => ({ page: i + 1, text })),
        hash: "fixture",
        size: 100,
        createdAt: p.createdAt,
      },
    ],
  }));
  return p;
}

const yes = (id, query, scope, expected, category = "factual") => ({
  id,
  query,
  scope,
  expected,
  category,
});
const no = (id, query, scope) => ({
  id,
  query,
  scope,
  expected: [],
  category: "abstention",
});
export const cases = [
  yes(
    "en-price",
    "What is the subscription price?",
    ["plan"],
    [["plan", 2, "12 dollars"]],
  ),
  yes("en-budget", "annual budget", ["plan"], [["plan", 3, "4800"]]),
  yes(
    "en-launch",
    "When will Atlas launch?",
    ["plan"],
    [["plan", 1, "15 October"]],
  ),
  yes(
    "en-email",
    "support email",
    ["plan"],
    [["plan", 4, "help@example.test"]],
  ),
  yes(
    "en-retention",
    "How long are activity records retained?",
    ["privacy"],
    [["privacy", 3, "30 days"]],
  ),
  yes(
    "en-encryption",
    "Are backup exports encrypted?",
    ["privacy"],
    [["privacy", 2, "not encrypted"]],
  ),
  yes(
    "en-storage",
    "Where are imported files stored?",
    ["privacy"],
    [["privacy", 1, "locally"]],
  ),
  yes("zh-price", "订阅价格是多少？", ["cn"], [["cn", 2, "八十元"]]),
  yes("zh-launch", "正式发布时间是什么？", ["cn"], [["cn", 3, "十月十五日"]]),
  yes("zh-risk", "主要风险是什么？", ["cn"], [["cn", 4, "网络中断"]]),
  yes("zh-language", "支持什么语言？", ["cn"], [["cn", 1, "中文和英文"]]),
  yes("zh-encryption", "备份是否加密？", ["cn"], [["cn", 5, "没有加密"]]),
  yes(
    "paraphrase-price",
    "How much does the monthly subscription cost?",
    ["plan"],
    [["plan", 2, "12 dollars"]],
    "paraphrase",
  ),
  yes(
    "paraphrase-retention",
    "data retention period",
    ["privacy"],
    [["privacy", 3, "30 days"]],
    "paraphrase",
  ),
  yes(
    "paraphrase-backup",
    "backup encryption",
    ["privacy"],
    [["privacy", 2, "not encrypted"]],
    "paraphrase",
  ),
  yes(
    "paraphrase-store",
    "local file storage",
    ["privacy"],
    [["privacy", 1, "locally"]],
    "paraphrase",
  ),
  yes(
    "cross-price",
    "订阅价格",
    ["plan"],
    [["plan", 2, "12 dollars"]],
    "cross-language",
  ),
  yes(
    "cross-budget",
    "年度预算",
    ["plan"],
    [["plan", 3, "4800"]],
    "cross-language",
  ),
  yes(
    "cross-retention",
    "记录保留期限",
    ["privacy"],
    [["privacy", 3, "30 days"]],
    "cross-language",
  ),
  yes(
    "cross-encrypt",
    "备份加密",
    ["privacy"],
    [["privacy", 2, "not encrypted"]],
    "cross-language",
  ),
  yes(
    "cross-cn-risk",
    "What risks are mentioned?",
    ["cn"],
    [["cn", 4, "网络中断"]],
    "cross-language",
  ),
  yes(
    "cross-cn-price",
    "monthly subscription price",
    ["cn"],
    [["cn", 2, "八十元"]],
    "cross-language",
  ),
  yes(
    "revision-price",
    "Compare subscription prices",
    ["plan", "revision"],
    [
      ["plan", 2, "12 dollars"],
      ["revision", 1, "replaces"],
    ],
    "revision",
  ),
  yes(
    "revision-budget",
    "Compare annual budgets",
    ["plan", "revision"],
    [
      ["plan", 3, "4800"],
      ["revision", 2, "replacing"],
    ],
    "revision",
  ),
  yes(
    "conflict-launch",
    "What launch dates are approved?",
    ["team-a", "team-b"],
    [
      ["team-a", 1, "2 November"],
      ["team-b", 1, "9 November"],
    ],
    "conflict-evidence",
  ),
  yes(
    "long-tail",
    "emergency recovery code",
    ["appendix"],
    [["appendix", 1, "SILVER-PINE-72"]],
    "long-document",
  ),
  yes(
    "filename",
    "What is the annual budget in Atlas plan.txt?",
    ["plan"],
    [["plan", 3, "4800"]],
  ),
  no("no-astronomy", "What is Jupiter made of?"),
  no("no-zh", "火星上有多少只猫？"),
  no("no-stopwords", "the and of"),
  no("no-zh-stopwords", "请问什么"),
  no("no-scope", "annual budget", []),
  no("wrong-scope", "subscription price", ["privacy"]),
  no("near-price", "What is the enterprise refund policy?", ["plan"]),
  no("near-entity", "What is the Atlas CEO salary?", ["plan"]),
  no("near-insurance", "What is the insurance budget?", ["plan"]),
  no("near-language", "Does Atlas support Arabic?", ["plan"]),
  no("near-costume", "costume design", ["plan"]),
  no("near-memory", "photographic memory", ["privacy"]),
  no("near-backup", "backup biometric authentication", ["privacy"]),
];
