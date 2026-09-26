// Match across PDF text-item boundaries, including line breaks and extra spaces.
export function matchingPdfItems(
  items: { str: string; hasEOL?: boolean }[],
  quote: string,
): Set<number> {
  const target = quote.replace(/\s+/g, " ").trim();
  if (!target) return new Set();
  const chars: string[] = [];
  const owners: number[] = [];
  let wasSpace = false;
  items.forEach((item, index) => {
    for (const ch of item.str + " ") {
      if (/\s/.test(ch)) {
        if (wasSpace) continue;
        chars.push(" ");
        wasSpace = true;
      } else {
        chars.push(ch);
        wasSpace = false;
      }
      // String#indexOf uses UTF-16 offsets, including both halves of emoji.
      for (let unit = 0; unit < (wasSpace ? 1 : ch.length); unit++)
        owners.push(index);
    }
  });
  const text = chars.join("");
  const start = text.indexOf(target);
  return new Set(start < 0 ? [] : owners.slice(start, start + target.length));
}
