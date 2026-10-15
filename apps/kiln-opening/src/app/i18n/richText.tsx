/**
 * Rich-text templates (UI_V1.6.1_ARCHITECTURE §6.1, U6).
 *
 * A template may contain `{param}` placeholders and only the tag placeholders `<b>…</b>` and
 * `<em>…</em>`. `parseTemplate` turns it into a token list; `renderTokens` builds React nodes
 * from it (`<b>` → `<strong>`, `<em>` → `<em>`). Parameters are always inserted as text or as
 * already-built React nodes: a parameter string is never parsed, so a player name such as
 * `<b>Lin</b>` is shown literally. HTML is never injected (raw-HTML props are forbidden in
 * `src/app`, §2).
 */
import { Fragment, createElement, isValidElement } from "react";
import type { ReactElement, ReactNode } from "react";

export type RichTag = "b" | "em";

export type TemplateToken =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "param"; readonly name: string }
  | { readonly kind: "open"; readonly tag: RichTag }
  | { readonly kind: "close"; readonly tag: RichTag };

const TOKEN = /<(\/?)(b|em)>|\{([A-Za-z][A-Za-z0-9_]*)\}/g;

/** Splits a template into text, parameter and tag tokens. Does not check tag balance. */
export function parseTemplate(template: string): TemplateToken[] {
  const tokens: TemplateToken[] = [];
  let last = 0;
  for (const match of template.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) tokens.push({ kind: "text", text: template.slice(last, index) });
    const [, slash, tag, param] = match;
    if (param !== undefined) tokens.push({ kind: "param", name: param });
    else tokens.push({ kind: slash === "/" ? "close" : "open", tag: tag as RichTag });
    last = index + match[0].length;
  }
  if (last < template.length) tokens.push({ kind: "text", text: template.slice(last) });
  return tokens;
}

/** The placeholder names a template uses, in order of first use. */
export function templatePlaceholders(template: string): string[] {
  const names: string[] = [];
  for (const token of parseTemplate(template)) {
    if (token.kind === "param" && !names.includes(token.name)) names.push(token.name);
  }
  return names;
}

/**
 * Problems with a template's markup, or `[]`: a `<` that is not a whitelisted tag, unbalanced
 * or crossed tags, or a stray brace. Used by the catalogue tests (§6.4 `rich_text`).
 */
export function templateProblems(template: string): string[] {
  const problems: string[] = [];
  const stack: RichTag[] = [];
  for (const token of parseTemplate(template)) {
    if (token.kind === "text") {
      if (token.text.includes("<") || token.text.includes(">")) problems.push(`raw angle bracket in "${token.text}"`);
      if (token.text.includes("{") || token.text.includes("}")) problems.push(`stray brace in "${token.text}"`);
    } else if (token.kind === "open") {
      stack.push(token.tag);
    } else if (token.kind === "close") {
      const open = stack.pop();
      if (open !== token.tag) problems.push(`</${token.tag}> closes ${open === undefined ? "nothing" : `<${open}>`}`);
    }
  }
  for (const open of stack) problems.push(`<${open}> is never closed`);
  return problems;
}

/** The template with its tag placeholders removed (plain-text rendering). */
export function stripTags(template: string): string {
  return template.replace(/<\/?(?:b|em)>/g, "");
}

/** A parameter value already resolved for rendering: text, or a React element. */
export type ResolvedParam = string | ReactElement;

/**
 * Builds React nodes from template tokens. `resolve` returns each parameter's value; strings
 * become text nodes. Unbalanced tags are closed at the end, so a malformed template still
 * renders its words.
 */
export function renderTokens(tokens: readonly TemplateToken[], resolve: (name: string) => ResolvedParam | ReactNode): ReactNode {
  interface Frame { tag: RichTag | null; children: ReactNode[] }
  const root: Frame = { tag: null, children: [] };
  const stack: Frame[] = [root];
  let key = 0;
  const top = (): Frame => stack[stack.length - 1] ?? root;
  const close = (): void => {
    const frame = stack.pop();
    if (frame === undefined || frame.tag === null) return;
    top().children.push(createElement(frame.tag === "b" ? "strong" : "em", { key: `t${key++}` }, ...frame.children));
  };
  for (const token of tokens) {
    switch (token.kind) {
      case "text":
        top().children.push(token.text);
        break;
      case "param": {
        const value = resolve(token.name);
        top().children.push(isValidElement(value) ? createElement(Fragment, { key: `p${key++}` }, value) : value);
        break;
      }
      case "open":
        stack.push({ tag: token.tag, children: [] });
        break;
      case "close":
        if (stack.length > 1 && top().tag === token.tag) close();
        break;
    }
  }
  while (stack.length > 1) close();
  const children = root.children;
  if (children.length === 0) return "";
  if (children.length === 1) return children[0] ?? "";
  return createElement(Fragment, null, ...children);
}
