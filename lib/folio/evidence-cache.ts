type Page = { text: string };
type Limits = {
  pages: number;
  pageCharacters: number;
  quotes: number;
  quoteCharacters: number;
};
type Bucket = { text: string; quotes: Map<string, boolean> };

export const evidenceCacheLimits: Limits = {
  pages: 64,
  // A permitted 20 MB text import can be one page. Text is referenced, not copied.
  pageCharacters: 24 * 1024 * 1024,
  quotes: 1024,
  quoteCharacters: 2 * 1024 * 1024,
};

/** Weak keys let closed documents release both their text and their checked passages. */
export function createEvidencePageCache(limits: Limits = evidenceCacheLimits) {
  let entries = new WeakMap<Page, Bucket>();
  let size = { pages: 0, pageCharacters: 0, quotes: 0, quoteCharacters: 0 };
  const clear = () => {
    entries = new WeakMap();
    size = { pages: 0, pageCharacters: 0, quotes: 0, quoteCharacters: 0 };
  };
  const contains = (page: Page, quote: string) => {
    if (!quote) return false;
    if (
      limits.pages < 1 ||
      limits.quotes < 1 ||
      page.text.length > limits.pageCharacters ||
      quote.length > limits.quoteCharacters
    )
      return page.text.includes(quote);
    let entry = entries.get(page);
    if (entry?.text === page.text) {
      const previous = entry.quotes.get(quote);
      if (previous !== undefined) return previous;
    }
    // Start a fresh bounded window on eviction or in-place source edits.
    // Counters may include collected pages. No strong reference is needed to count them.
    if (
      (entry && entry.text !== page.text) ||
      (!entry &&
        (size.pages >= limits.pages ||
          size.pageCharacters + page.text.length > limits.pageCharacters)) ||
      size.quotes >= limits.quotes ||
      size.quoteCharacters + quote.length > limits.quoteCharacters
    ) {
      clear();
      entry = undefined;
    }
    if (!entry) {
      entry = { text: page.text, quotes: new Map() };
      entries.set(page, entry);
      size.pages++;
      size.pageCharacters += page.text.length;
    }
    const result = page.text.includes(quote);
    entry.quotes.set(quote, result);
    size.quotes++;
    size.quoteCharacters += quote.length;
    return result;
  };
  return { contains, clear, size: () => ({ ...size }) };
}

export const pageContainsQuote = createEvidencePageCache().contains;
