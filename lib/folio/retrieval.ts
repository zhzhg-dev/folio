import type { Evidence, Project } from "./model.ts";

const stop = new Set(
  "a an and are as at be been by can could did do does for from had has have how i in into is it its me of on or our please should that the their them there these they this to us was were what when where which who why will with would you your summarize summary compare explain tell about more also source sources document documents mention mentions describe describes 根据 资料 什么 哪些 如何 为什么 是否 请问 请 帮我 总结 概括 对比 比较 回答 一个 这个 这些 那些 以及 还有 其中".split(
    /\s+/,
  ),
);
const concepts = [
  ["cost", "costs", "price", "pricing", "费用", "成本", "价格"],
  ["revenue", "收入", "营收"],
  ["deadline", "due", "截止", "期限"],
  ["privacy", "private", "隐私"],
  ["risk", "risks", "风险"],
  ["research", "研究"],
  ["launch", "release", "发布", "上线"],
  ["storage", "存储"],
  ["memory", "内存"],
  ["users", "用户"],
];
export function terms(text: string): string[] {
  const normalized = text.normalize("NFKC").toLowerCase();
  const tokens = normalized.match(/[a-z0-9]+|[\u3400-\u9fff]+/g) || [];
  return tokens.flatMap((token) => {
    if (stop.has(token)) return [];
    if (/^[\u3400-\u9fff]+$/.test(token)) {
      const cleaned = [...stop]
        .filter((s) => /[\u3400-\u9fff]/.test(s))
        .reduce((v, s) => v.replaceAll(s, " "), token);
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
    return token.length > 1 ? [token] : [];
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
): Evidence[] {
  const sources = project.sources.filter((s) => selectedIds.includes(s.id));
  const topicQuery = sources.reduce(
    (q, s) => q.replaceAll(s.name.toLowerCase(), " "),
    query.toLowerCase(),
  );
  const queryTerms = [...new Set(terms(topicQuery))];
  const expansions = new Set<string>();
  for (const group of concepts)
    if (group.some((word) => topicQuery.includes(word)))
      group.forEach((word) => terms(word).forEach((t) => expansions.add(t)));
  const allTerms = [...new Set([...queryTerms, ...expansions])];
  const summary =
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
  const frequencies = new Map(
    allTerms.map((term) => [
      term,
      chunks.filter((c) => c.tokens.includes(term)).length,
    ]),
  );
  const scored = chunks
    .map((c) => {
      let score = 0;
      for (const term of allTerms) {
        const count = c.tokens.filter((t) => t === term).length;
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
      return { ...c, score: score + (summary ? 0.2 : 0), hits };
    })
    .filter(
      (c) =>
        summary ||
        (c.score > 0 &&
          (c.hits > 0 || allTerms.some((t) => c.tokens.includes(t)))),
    );
  const chosen: typeof scored = [];
  const bestScore = Math.max(0, ...scored.map((c) => c.score));
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
  return chosen.map(({ tokens, title, score, hits, ...e }, i) => ({
    ...e,
    id: `E${i + 1}`,
  }));
}
