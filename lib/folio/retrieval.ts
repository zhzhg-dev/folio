import type { Evidence, Project } from "./model.ts";

const stop = new Set(
  "a an and are as at be been by can could did do does for from had has have how i in into is it its me of on or our please should that the their them there these they this to us was were what when where which who why will with would you your summarize summary overview compare explain tell about more also source sources document documents mention mentions mentioned describe describes data much long period date dates main key ideas points according project 根据 资料 什么 哪些 如何 为什么 是否 请问 请 帮我 总结 概括 主要观点 核心观点 对比 比较 回答 一个 这个 这些 那些 以及 还有 其中 多少 是的 中的".split(
    /\s+/,
  ),
);
const concepts = [
  ["cost", "costs", "price", "prices", "pricing", "费用", "成本", "价格"],
  ["budget", "budgets", "预算"],
  ["annual", "annually", "yearly", "年度", "每年"],
  ["monthly", "month", "每月", "月度"],
  ["subscription", "subscriptions", "订阅"],
  ["revenue", "收入", "营收"],
  ["deadline", "due", "截止", "期限"],
  ["privacy", "private", "隐私"],
  ["risk", "risks", "风险"],
  ["research", "研究"],
  ["launch", "release", "发布", "上线"],
  ["storage", "store", "stored", "存储", "存放"],
  ["local", "locally", "本地", "本机"],
  ["file", "files", "文件"],
  ["record", "records", "记录"],
  ["retain", "retained", "retention", "保留"],
  ["backup", "backups", "备份"],
  ["encrypt", "encrypted", "encryption", "加密"],
  ["memory", "内存"],
  ["user", "users", "用户"],
];
const chineseStop = [...stop]
  .filter((s) => /[\u3400-\u9fff]/.test(s))
  .sort((a, b) => b.length - a.length);
const singular = (word: string) =>
  word.length > 3 && word.endsWith("s") && !/(ss|us|is)$/.test(word)
    ? word.slice(0, -1)
    : word;
const containsAlias = (query: string, alias: string) =>
  /[\u3400-\u9fff]/.test(alias)
    ? query.includes(alias)
    : query.split(/[^a-z0-9]+/).includes(alias);
// One unit per concept: aliases cannot inflate match coverage or ranking.
function queryUnits(query: string): string[][] {
  let remainder = query;
  const units: string[][] = [];
  if (/\blanguages?\b|语言/.test(query)) {
    units.push(["language", "语言", "中文", "英文", "english", "chinese"]);
    remainder = remainder.replace(/\blanguages?\b|语言/g, " ");
  }
  for (const group of concepts) {
    if (!group.some((alias) => containsAlias(query, alias))) continue;
    units.push([...new Set(group.flatMap(terms))]);
    for (const alias of group) {
      if (/[\u3400-\u9fff]/.test(alias))
        remainder = remainder.replaceAll(alias, " ");
      else
        remainder = remainder.replace(
          new RegExp("\\b" + alias + "\\b", "g"),
          " ",
        );
    }
  }
  units.push(...[...new Set(terms(remainder))].map((term) => [term]));
  return units;
}
export function terms(text: string): string[] {
  const normalized = text.normalize("NFKC").toLowerCase();
  const tokens = normalized.match(/[a-z0-9]+|[\u3400-\u9fff]+/g) || [];
  return tokens.flatMap((token) => {
    if (stop.has(token)) return [];
    if (/^[\u3400-\u9fff]+$/.test(token)) {
      const cleaned = chineseStop.reduce((v, s) => v.replaceAll(s, " "), token);
      return cleaned
        .split(/\s+/)
        .flatMap((part) =>
          part.length < 2
            ? []
            : Array.from({ length: part.length - 1 }, (_, i) =>
                part.slice(i, i + 2),
              ),
        )
        .filter((t) => !stop.has(t));
    }
    return token.length > 1 ? [singular(token)] : [];
  });
}

// Exact slices of the original page: retrieval never normalizes the stored quote.
export function chunkPage(text: string, limit = 520): string[] {
  const paragraphs = text
    .split(/\n\s*\n|(?<=[。！？.!?])\s*\n/)
    .filter((p) => p.trim());
  if (paragraphs.length > 1)
    return paragraphs.flatMap((p) => chunkPage(p, limit));
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + limit, text.length);
    if (end < text.length) {
      const section = text.slice(start, end);
      const boundaries = [...section.matchAll(/[。！？.!?\n](?:\s|$)/g)];
      const last = boundaries.at(-1);
      if (last && last.index! > limit * 0.45) end = start + last.index! + 1;
      else {
        const space = section.lastIndexOf(" ");
        if (space > limit * 0.7) end = start + space;
      }
    }
    const quote = text.slice(start, end).trim();
    if (quote) chunks.push(quote);
    if (end >= text.length) break;
    // Sentence-boundary chunks are adjacent; hard-split long prose overlaps.
    start = /[。！？.!?\n]$/.test(text.slice(start, end))
      ? end
      : Math.max(start + 1, end - 70);
  }
  return chunks;
}
export function contextualQuery(question: string, previousQuestion?: string) {
  const followup =
    /\b(it|they|those|these|that|them|more|also|what about|how about)\b|它|这些|那些|上述|其中|再说|那.{0,4}呢/i.test(
      question,
    );
  return followup && previousQuestion
    ? `${previousQuestion.slice(0, 220)}\n${question}`
    : question;
}
export function retrieve(
  project: Project,
  query: string,
  selectedIds: string[],
  context?: string,
): Evidence[] {
  const sources = project.sources.filter((s) => selectedIds.includes(s.id));
  const topicQuery = sources.reduce(
    (q, s) => q.replaceAll(s.name.toLowerCase(), " "),
    query.toLowerCase(),
  );
  const queryTerms = [...new Set(terms(topicQuery))];
  const units = queryUnits(topicQuery);
  if (!units.length && context) return retrieve(project, context, selectedIds);
  const contextTerms = context ? [...new Set(terms(context))] : [];
  const allTerms = [...new Set(units.flat())];
  const summary =
    units.length === 0 &&
    /\b(summarize|summary|overview|main ideas|key points)\b|总结|概括|主要观点|核心观点/.test(
      query.toLowerCase(),
    );
  const chunks = sources.flatMap((s) => {
    const v = s.versions.at(-1)!;
    return v.pages.flatMap((p) =>
      chunkPage(p.text).map((quote) => ({
        sourceId: s.id,
        versionId: v.id,
        page: p.page,
        quote,
        name: s.name,
        label: String(project.sources.indexOf(s) + 1),
        tokens: terms(quote),
        title: terms(s.name),
      })),
    );
  });
  if (!chunks.length || (!allTerms.length && !summary)) return [];
  const avg =
    chunks.reduce((n, c) => n + c.tokens.length, 0) / chunks.length || 1;
  const tokenCounts = chunks.map((c) => {
    const counts = new Map<string, number>();
    c.tokens.forEach((t) => counts.set(t, (counts.get(t) || 0) + 1));
    return counts;
  });
  const frequencies = new Map(
    allTerms.map((term) => [
      term,
      tokenCounts.filter((c) => c.has(term)).length,
    ]),
  );
  const scored = chunks
    .map((c, index) => {
      const counts = tokenCounts[index];
      const coverage =
        units.filter((unit) => unit.some((term) => counts.has(term))).length /
        Math.max(1, units.length);
      let score = 0;
      score +=
        contextTerms.filter((t) => counts.has(t) || c.title.includes(t))
          .length * 0.15;
      for (const term of allTerms) {
        const count = counts.get(term) || 0;
        const df = frequencies.get(term)!;
        const idf = Math.log(1 + (chunks.length - df + 0.5) / (df + 0.5));
        const weight = queryTerms.includes(term) ? 1 : 0.55;
        score +=
          weight *
          idf *
          ((count * 2.2) /
            (count + 1.2 * (0.25 + (0.75 * c.tokens.length) / avg)));
        if (c.title.includes(term)) score += weight * 0.25;
      }
      const hits = queryTerms.filter((t) => c.tokens.includes(t)).length;
      // Prefer a specific phrase ("annual budget") over an isolated heading word.
      for (let i = 0; i < queryTerms.length - 1; i++) {
        const pair = queryTerms.slice(i, i + 2);
        if (
          pair.every((t) => /^[a-z0-9]+$/.test(t)) &&
          c.quote.toLowerCase().includes(pair.join(" "))
        )
          score += 2;
      }
      return { ...c, score: score + (summary ? 0.2 : 0), hits, coverage };
    })
    .filter(
      (c) =>
        summary ||
        (c.coverage >= 0.6 &&
          c.score > 0 &&
          (c.hits > 0 || allTerms.some((t) => c.tokens.includes(t)))),
    );
  const chosen: typeof scored = [];
  const bestScore = scored.reduce((best, c) => Math.max(best, c.score), 0);
  let characters = 0;
  while (scored.length && chosen.length < 6 && characters < 2400) {
    scored.sort((a, b) => {
      const adjusted = (c: typeof a) =>
        c.score /
        (1 + chosen.filter((e) => e.sourceId === c.sourceId).length * 0.6);
      return adjusted(b) - adjusted(a);
    });
    const next = scored.shift()!;
    if (!summary && next.score < bestScore * 0.3) continue;
    if (
      chosen.some(
        (c) =>
          c.sourceId === next.sourceId &&
          c.page === next.page &&
          (c.quote.includes(next.quote) || next.quote.includes(c.quote)),
      )
    )
      continue;
    const remaining = 2400 - characters;
    if (remaining < 160) break;
    next.quote = next.quote.slice(0, remaining);
    chosen.push(next);
    characters += next.quote.length;
  }
  return chosen.map(({ tokens, title, score, hits, coverage, ...e }, i) => ({
    ...e,
    id: `E${i + 1}`,
  }));
}
