/**
 * Accessible text of static markup for the piece and kit tests: `aria-hidden` subtrees are
 * dropped and an element with `aria-label` contributes its label instead of its content.
 * A small approximation of the accessible-name computation, parsed with happy-dom.
 */
import { Window } from "happy-dom";

export function accessibleText(markup: string): string {
  const window = new Window();
  const document = window.document;
  document.body.innerHTML = markup;
  const walk = (node: Node): string => {
    if (node.nodeType === 3) return node.textContent ?? "";
    if (node.nodeType !== 1) return "";
    const element = node as unknown as Element;
    if (element.getAttribute("aria-hidden") === "true") return "";
    const label = element.getAttribute("aria-label");
    if (label !== null) return ` ${label} `;
    return Array.from(element.childNodes).map((child) => walk(child as unknown as Node)).join(" ");
  };
  const text = walk(document.body as unknown as Node).replace(/\s+/g, " ").trim();
  window.close();
  return text;
}

/** Every `aria-label`, `title` and `alt` value plus visible text (what rendered-text checks scan). */
export function scannedText(markup: string): string {
  const attributes = [...markup.matchAll(/\b(?:aria-label|title|alt)="([^"]*)"/g)].map((match) => match[1] ?? "");
  const text = markup.replace(/<[^>]+>/g, " ");
  return [...attributes, text].join(" ").replace(/\s+/g, " ");
}
