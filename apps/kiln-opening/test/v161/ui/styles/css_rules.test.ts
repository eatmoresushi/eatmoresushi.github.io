import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "../../support/glossary.ts";

/**
 * CSS rules (UI_V1.6.1_ARCHITECTURE §7.3), over every `src/app/**\/*.css` and `src/app/**\/*.tsx`:
 * - no colour literals outside `styles/tokens.css`; light/dark token parity;
 * - every `font-size` and `font:` shorthand uses a `--fs-*` token; no token below 0.75rem;
 * - no `scale(`, `zoom:` or `light-dark(`;
 * - every CSS file wraps its rules in a cascade layer;
 * - TSX `style` props set only custom properties (`--*`);
 * - `styles/index.css` is the first import of each entry.
 */
const APP = join(ROOT, "src/app");

function files(dir: string, extension: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path, extension);
    return path.endsWith(extension) ? [path] : [];
  });
}

const CSS_FILES = files(APP, ".css");
const TSX_FILES = files(APP, ".tsx");
const TOKENS = join(APP, "styles/tokens.css");
const rel = (path: string) => relative(ROOT, path);
const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** CSS named colours (CSS Color 4), excluding the keywords `transparent` and `currentcolor`. */
const NAMED_COLOURS = new Set(
  ("aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse " +
    "chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta " +
    "darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet " +
    "deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green " +
    "greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral " +
    "lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray " +
    "lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple " +
    "mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite " +
    "navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink " +
    "plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue " +
    "slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen").split(" "),
);

/** Declarations `property: value` of a stylesheet (custom properties included). */
function declarations(css: string): Array<{ property: string; value: string }> {
  return [...withoutComments(css).matchAll(/(?<=[{;\s])([-a-zA-Z]+)\s*:\s*([^;{}]+)(?=;|\})/g)].map((match) => ({
    property: (match[1] ?? "").toLowerCase(),
    value: (match[2] ?? "").trim(),
  }));
}

function colourLiterals(value: string): string[] {
  const found: string[] = [];
  const bare = value
    .replace(/url\([^)]*\)/g, "")
    .replace(/"[^"]*"|'[^']*'/g, "")
    .replace(/--[\w-]+/g, "");
  for (const match of bare.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) found.push(match[0]);
  for (const match of bare.matchAll(/\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/g)) found.push(match[0]);
  for (const word of bare.toLowerCase().match(/[a-z]+/g) ?? []) if (NAMED_COLOURS.has(word)) found.push(word);
  return found;
}

/** Top-level text of a stylesheet outside any `@layer … { }` block (should be empty). */
function outsideLayers(css: string): string {
  const text = withoutComments(css);
  let depth = 0;
  let outside = "";
  let index = 0;
  while (index < text.length) {
    if (depth === 0) {
      const layer = /^@layer\s+[\w-]+\s*\{/.exec(text.slice(index));
      if (layer !== null) {
        depth = 1;
        index += layer[0].length;
        continue;
      }
      const statement = /^@(layer\s+[\w\s,-]+|import\s+[^;]+);/.exec(text.slice(index));
      if (statement !== null) {
        index += statement[0].length;
        continue;
      }
      outside += text[index];
    } else if (text[index] === "{") depth += 1;
    else if (text[index] === "}") depth -= 1;
    index += 1;
  }
  return outside.trim();
}

function tokenBlock(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`tokens.css has no ${selector} block`);
  return css.slice(start, css.indexOf("}", start));
}

/** Object-literal contents passed to `style` in a TSX file (inline, or a `… as CSSProperties` value). */
function styleObjects(source: string): string[] {
  const objects: string[] = [];
  const balanced = (from: number): string => {
    let depth = 0;
    for (let index = from; index < source.length; index += 1) {
      if (source[index] === "{") depth += 1;
      else if (source[index] === "}") {
        depth -= 1;
        if (depth === 0) return source.slice(from, index + 1);
      }
    }
    return source.slice(from);
  };
  for (const match of source.matchAll(/style=\{\{/g)) objects.push(balanced((match.index ?? 0) + "style={".length));
  for (const match of source.matchAll(/=\s*\{(?=[\s\S]{0,400}?\}\s*as CSSProperties)/g)) objects.push(balanced((match.index ?? 0) + match[0].length - 1));
  return objects;
}

/** Property keys of a style object literal. */
function styleKeys(object: string): string[] {
  return [...object.matchAll(/(?:^\{|,|\{)\s*(["']?)([A-Za-z-][\w-]*)\1\s*:/g)].map((match) => match[2] ?? "");
}

describe("CSS rule detectors", () => {
  it("catch the mistakes they exist for", () => {
    expect(colourLiterals("1px solid #fff")).toEqual(["#fff"]);
    expect(colourLiterals("rgb(0 0 0 / 10%)")).toEqual(["rgb("]);
    expect(colourLiterals("white")).toEqual(["white"]);
    expect(colourLiterals("var(--gold) url(\"red.png\")")).toEqual([]);
    expect(outsideLayers(".a { color: var(--ink); }")).not.toBe("");
    expect(outsideLayers("@layer components { .a { color: var(--ink); } }")).toBe("");
    const objects = styleObjects('<b style={{ color: "x", "--pc": "y" }} />');
    expect(objects.flatMap(styleKeys)).toEqual(["color", "--pc"]);
    expect(styleObjects('const s = { "--a": 1, ...(x ? { "--b": 2 } : {}) } as CSSProperties;').flatMap(styleKeys)).toEqual(["--a", "--b"]);
    expect(declarations(".a { font-size: 12px; }")).toEqual([{ property: "font-size", value: "12px" }]);
  });
});

describe("CSS rules", () => {
  it("finds the A3 stylesheets", () => {
    expect(CSS_FILES.map(rel)).toEqual(expect.arrayContaining(["src/app/styles/tokens.css", "src/app/styles/index.css", "src/app/kit/Button.css"]));
  });

  it.each(CSS_FILES.filter((path) => path !== TOKENS).map((path) => [rel(path), path] as const))("%s has no colour literals", (_, path) => {
    const offences = declarations(readFileSync(path, "utf8"))
      .flatMap(({ property, value }) => colourLiterals(value).map((literal) => `${property}: ${literal}`));
    expect(offences).toEqual([]);
  });

  it.each(TSX_FILES.map((path) => [rel(path), path] as const))("%s has no colour literals", (_, path) => {
    const source = readFileSync(path, "utf8");
    const offences = [
      ...[...source.matchAll(/(["'`])#[0-9a-fA-F]{3,8}\1/g)].map((match) => match[0]),
      ...[...source.matchAll(/["'`](?:rgba?|hsla?)\(/g)].map((match) => match[0]),
      ...[...source.matchAll(/\b(?:fill|stroke|color|stopColor)=["']([a-z]+)["']/g)]
        .filter((match) => NAMED_COLOURS.has((match[1] ?? "").toLowerCase()))
        .map((match) => match[0]),
    ];
    expect(offences).toEqual([]);
  });

  it("defines the same colour tokens in the light and dark blocks", () => {
    const css = withoutComments(readFileSync(TOKENS, "utf8"));
    const names = (block: string) => [...block.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]).sort();
    const light = names(tokenBlock(css, '[data-theme="light"]'));
    const dark = names(tokenBlock(css, '[data-theme="dark"]'));
    expect(light.length).toBeGreaterThan(80);
    expect(dark).toEqual(light);
  });

  it("keeps the type scale in rem with a 12px floor", () => {
    const css = withoutComments(readFileSync(TOKENS, "utf8"));
    const scale = [...css.matchAll(/(--fs-\d+):\s*([\d.]+)rem;/g)];
    expect(scale.length).toBeGreaterThanOrEqual(10);
    for (const [, name, value] of scale) expect(Number(value), name).toBeGreaterThanOrEqual(0.75);
    for (const match of css.matchAll(/(--fs-[a-z]+):\s*([^;]+);/g)) expect(match[2], match[1]).toMatch(/^var\(--fs-\d+\)$/);
  });

  it.each(CSS_FILES.map((path) => [rel(path), path] as const))("%s sizes text only with --fs-* tokens", (_, path) => {
    const offences = declarations(readFileSync(path, "utf8"))
      .filter(({ property }) => property === "font-size" || property === "font")
      .filter(({ value }) => value !== "inherit" && !/var\(--fs-[\w-]+\)/.test(value))
      .map(({ property, value }) => `${property}: ${value}`);
    expect(offences).toEqual([]);
  });

  it.each(CSS_FILES.map((path) => [rel(path), path] as const))("%s has no scaling, zoom or light-dark()", (_, path) => {
    const css = withoutComments(readFileSync(path, "utf8"));
    expect(css).not.toMatch(/\bscale\(|\bzoom\s*:|light-dark\(/);
  });

  it.each(CSS_FILES.map((path) => [rel(path), path] as const))("%s wraps every rule in a cascade layer", (_, path) => {
    expect(outsideLayers(readFileSync(path, "utf8"))).toBe("");
  });

  it("declares the layer order in styles/index.css", () => {
    const css = withoutComments(readFileSync(join(APP, "styles/index.css"), "utf8")).trim();
    expect(css.startsWith("@layer reset, tokens, base, layout, components, states, utilities;")).toBe(true);
  });

  it.each(TSX_FILES.map((path) => [rel(path), path] as const))("%s sets only custom properties in style props", (_, path) => {
    const source = readFileSync(path, "utf8");
    const offences = styleObjects(source).flatMap(styleKeys).filter((key) => !key.startsWith("--"));
    expect(offences).toEqual([]);
  });

  it("clips the full-screen shell and the phone sheet (overflow: clip), so focus() or scrollIntoView() can never shift them", () => {
    // Regression (owner review, 2026-10-17): with overflow: hidden, focusing a control scrolled
    // .shell by hundreds of pixels and nothing let the player scroll it back.
    const rule = (file: string, selector: string): string => {
      const css = withoutComments(readFileSync(join(APP, file), "utf8"));
      const at = css.indexOf(`${selector} {`);
      expect(at, `${file} ${selector}`).toBeGreaterThanOrEqual(0);
      return css.slice(at, css.indexOf("}", at));
    };
    expect(rule("shell/GameShell.css", ".shell")).toMatch(/overflow:\s*clip;/);
    expect(rule("kit/Sheet.css", "    .kit-sheet")).toMatch(/overflow:\s*clip;/);
  });

  const ENTRIES = ["src/app/main.tsx", "src/app/playtest/main.tsx", "src/app/dev/gallery-main.tsx"];
  it.each(ENTRIES)("%s imports styles/index.css first", (entry) => {
    const path = join(ROOT, entry);
    if (!existsSync(path)) return;
    const first = /^\s*import\s+(?:[^'"]*from\s+)?["']([^"']+)["']/m.exec(readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""));
    expect(first?.[1], entry).toMatch(/(^|\/)styles\/index\.css$/);
  });
});
