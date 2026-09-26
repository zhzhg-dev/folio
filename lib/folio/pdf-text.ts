// Match across PDF text-item boundaries, including line breaks and extra spaces.
export function matchingPdfItems(
  items: { str: string; hasEOL?: boolean }[],
  quote: string,
): Set<number> {
  let text = "";
  const owners: number[] = [];
  items.forEach((item, index) => {
    for (const ch of item.str + " ") {
      if (/\s/.test(ch)) {
        if (text.endsWith(" ")) continue;
        text += " ";
      } else text += ch;
      owners.push(index);
    }
  });
  const target = quote.replace(/\s+/g, " ").trim();
  if (!target) return new Set();
  const start = text.indexOf(target);
  return new Set(start < 0 ? [] : owners.slice(start, start + target.length));
}
