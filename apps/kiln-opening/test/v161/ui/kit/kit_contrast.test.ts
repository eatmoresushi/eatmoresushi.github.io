import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "../../support/glossary.ts";

/**
 * Kit text contrast (§8.1, the §9.6 axe gate): states that keep text readable must reach 4.5:1
 * in both themes. Only `aria-disabled` may fade (axe exempts disabled controls); a busy button
 * ("Sending…") is still read and keeps full colour.
 */
const read = (path: string) => readFileSync(join(ROOT, path), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const TOKENS = read("src/app/styles/tokens.css");

function block(selector: string): Record<string, string> {
  const start = TOKENS.indexOf(selector);
  if (start < 0) throw new Error(`no ${selector}`);
  const open = TOKENS.indexOf("{", start);
  const body = TOKENS.slice(open + 1, TOKENS.indexOf("}", open));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((match) => [match[1] ?? "", (match[2] ?? "").trim()]));
}

const THEMES = { light: block('[data-theme="light"]'), dark: block(':root[data-theme="dark"]') };

function luminance(hex: string): number {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? [...value].map((c) => c + c).join("") : value;
  const channel = (i: number) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

function contrast(theme: Record<string, string>, fg: string, bg: string): number {
  const a = theme[fg];
  const b = theme[bg];
  if (a === undefined || b === undefined || !a.startsWith("#") || !b.startsWith("#")) throw new Error(`token ${fg} or ${bg} is not a hex colour`);
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** The body of the first rule whose selector list matches `selector` exactly. */
function rule(css: string, selector: RegExp): string {
  const match = new RegExp(`${selector.source}\\s*\\{([^}]*)\\}`).exec(css);
  if (match === null) throw new Error(`no rule ${selector.source}`);
  return match[1] ?? "";
}

describe("kit contrast", () => {
  it.each(Object.entries(THEMES))("text pairs reach 4.5:1 (%s)", (_, theme) => {
    const pairs: Array<[string, string, string]> = [
      ["used chip", "--ink-2", "--paper"],
      ["used chip", "--ink-2", "--paper-2"],
      ["used chip", "--ink-2", "--surface"],
      ["used chip", "--ink-2", "--surface-2"],
      ["busy primary button", "--on-teal", "--teal"],
      ["pill reason", "--bad-ink", "--surface"],
      ["pill reason (disabled pill)", "--bad-ink", "--surface-2"],
      ["checked pill note", "--on-teal", "--teal"],
    ];
    for (const [what, fg, bg] of pairs) expect(contrast(theme, fg, bg), `${what}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });

  it("a busy button is not faded; only aria-disabled is", () => {
    const css = read("src/app/kit/Button.css");
    expect(css).not.toMatch(/aria-busy="true"\][^{]*\{[^}]*opacity/);
    expect(rule(css, /\.kit-btn\[aria-disabled="true"\]/)).toMatch(/opacity/);
    expect(css).toMatch(/\.kit-btn\[aria-busy="true"\]::before/);
  });

  it("the used chip uses --ink-2 text, not --ink-3", () => {
    const body = rule(read("src/app/kit/Chip.css"), /\.kit-chip--used/);
    expect(body).toMatch(/color:\s*var\(--ink-2\)/);
    expect(body).not.toMatch(/--ink-3/);
  });

  it("a pill's reason and note are never visually hidden", () => {
    const css = read("src/app/kit/OptionCard.css");
    for (const selector of [/\.kit-opt--pill \.kit-opt-reason/, /\.kit-opt--pill \.kit-opt-desc/]) {
      for (const match of css.matchAll(new RegExp(`([^{}]*${selector.source}[^{}]*)\\{([^}]*)\\}`, "g"))) {
        expect(match[2] ?? "", match[1]).not.toMatch(/clip|width:\s*1px|position:\s*absolute/);
      }
    }
  });
});
