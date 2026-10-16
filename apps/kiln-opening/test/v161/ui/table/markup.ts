/**
 * Markup helpers for B2's SSR tests: plain text, and the markup with closed `PieceDetail` panels
 * removed (what a sighted player sees before opening any rules details).
 */

const ENTITIES: Readonly<Record<string, string>> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#x27;": "'", "&#39;": "'" };

export function decode(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|#x27|#39);/g, (entity) => ENTITIES[entity] ?? entity);
}

/** Text content, tags dropped and entities decoded, whitespace collapsed. */
export function textOf(html: string): string {
  return decode(html.replace(/<\/?(?:strong|b|em)\b[^>]*>/g, "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

/** The markup without every closed (`hidden`) PieceDetail panel. */
export function withoutClosedPanels(html: string): string {
  let out = "";
  let index = 0;
  for (;;) {
    const marker = html.indexOf('class="kit-detail-panel"', index);
    if (marker < 0) return out + html.slice(index);
    const start = html.lastIndexOf("<div", marker);
    const openTag = html.slice(start, html.indexOf(">", marker) + 1);
    let depth = 0;
    let cursor = start;
    let end = start;
    for (;;) {
      const open = html.indexOf("<div", cursor);
      const close = html.indexOf("</div>", cursor);
      if (close < 0) throw new Error("unbalanced panel markup");
      if (open !== -1 && open < close) {
        depth += 1;
        cursor = open + 4;
      } else {
        depth -= 1;
        cursor = close + 6;
        if (depth === 0) {
          end = cursor;
          break;
        }
      }
    }
    out += html.slice(index, start);
    if (!/\shidden=""/.test(openTag)) out += html.slice(start, end);
    index = end;
  }
}

/** Visible text: closed panels removed. */
export function visibleText(html: string): string {
  return textOf(withoutClosedPanels(html));
}

/** Every rules-details panel (`PieceDetail` panel) with its label, as markup. */
export function panels(html: string): Array<{ label: string; html: string }> {
  const found: Array<{ label: string; html: string }> = [];
  let index = 0;
  for (;;) {
    const marker = html.indexOf('class="kit-detail-panel"', index);
    if (marker < 0) return found;
    const start = html.lastIndexOf("<div", marker);
    const openTag = html.slice(start, html.indexOf(">", marker) + 1);
    let depth = 0;
    let cursor = start;
    for (;;) {
      const open = html.indexOf("<div", cursor);
      const close = html.indexOf("</div>", cursor);
      if (open !== -1 && open < close) {
        depth += 1;
        cursor = open + 4;
      } else {
        depth -= 1;
        cursor = close + 6;
        if (depth === 0) break;
      }
    }
    found.push({ label: decode(/aria-label="([^"]*)"/.exec(openTag)?.[1] ?? ""), html: html.slice(start, cursor) });
    index = cursor;
  }
}

/** The panel whose label is exactly `label`. */
export function panel(html: string, label: string): string {
  const match = panels(html).find((entry) => entry.label === label);
  if (match === undefined) throw new Error(`no rules panel "${label}" (have: ${panels(html).map((entry) => entry.label).join(", ")})`);
  return match.html;
}
