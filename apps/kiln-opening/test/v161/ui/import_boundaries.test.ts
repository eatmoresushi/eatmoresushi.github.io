/**
 * Import boundaries of the V1.6.1 app (UI_V1.6.1_ARCHITECTURE §2, K6). Created by A2; owned by B6
 * after phase A.
 *
 * Every `src/app/**` file is parsed with the TypeScript compiler, so comments never count and
 * destructuring, property names and string literals (`counts["fireDeck"]`) are caught:
 * - **imports** only from `src/app`, the engine barrel, `src/multiplayer/client.ts`,
 *   `src/multiplayer/types.ts` (types only), `src/playtest/{model,schema,client,types}.ts`, the
 *   approved art in `assets/current_v04/`, and React; never the multiplayer barrel, the service,
 *   the stores, the computer policy, V1.4 code, `src/ui` or test code. `import.meta.glob` only in
 *   `src/app/dev/**`, and the test fixtures only lazily;
 * - **forbidden identifiers and strings** (heat previews, the firing context, the Fire-deck
 *   count, the engine dispatcher, `dangerouslySetInnerHTML`, the pattern `game.firing`); the
 *   heat-calculation fields only in `i18n/events.ts` (the log's public history);
 * - `useEngineView` only in `decision/**`, `state/**`, `dev/**`; `useSnapshot` and
 *   `useGameContext` (the raw snapshot carries the raw `PlayerView`) only there and in
 *   `App.tsx`; `legalCommands` only in
 *   `dev/**`; the engine content constants only in `i18n/**` and `playtest/**`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { ROOT } from "../support/glossary.ts";

const APP = join(ROOT, "src/app");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

const SOURCES = files(APP);
const rel = (path: string) => relative(ROOT, path).split("\\").join("/");

// ── Rules ─────────────────────────────────────────────────────────────────────────────────

const ALLOWED_TARGETS: readonly RegExp[] = [
  /^src\/app\//,
  /^src\/game\/index\.ts$/,
  /^src\/multiplayer\/client\.ts$/,
  /^src\/multiplayer\/types\.ts$/,
  /^src\/playtest\/(model|schema|client|types)\.ts$/,
  /^assets\/current_v04\/.+\.(webp|png|jpe?g|svg)$/,
];
const TYPE_ONLY_TARGETS: readonly RegExp[] = [/^src\/multiplayer\/types\.ts$/];
const BARE_ALLOWED = new Set(["react", "react-dom", "react-dom/client", "react/jsx-runtime"]);

const FORBIDDEN_NAMES = new Set([
  "applyAction",
  "createGame",
  "submitContribution",
  "sampleLegalAction",
  "enumerateLegalActions",
  "heatPreviews",
  "qualityByFire",
  "heatBeforeFire",
  "qualityForDifference",
  "scorePreview",
  "firingSummary",
  "lastFiring",
  "fireDeck",
  "HeatCalculation",
  "dangerouslySetInnerHTML",
]);
const HEAT_FIELDS = new Set(["actualHeat", "finalActualHeat", "heatSource", "heatDifference"]);
const HEAT_FIELD_FILES = new Set(["src/app/i18n/events.ts"]);
const CONTENT_CONSTANTS = new Set(["GAME_CONFIG", "FIRING", "IMPERIAL_TRACK", "LOCATIONS", "TECHS", "KILNS", "ORDERS", "ROUND_STRUCTURE"]);

const inDir = (file: string, ...dirs: string[]) => dirs.some((dir) => file.startsWith(`src/app/${dir}/`));

export interface Offence {
  file: string;
  line: number;
  what: string;
}

/** Every boundary offence in one source text (exported shape for the detector self-test). */
function offencesIn(file: string, source: string): Offence[] {
  const offences: Offence[] = [];
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const at = (node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const flag = (node: ts.Node, what: string) => offences.push({ file, line: at(node), what });

  const checkSpecifier = (node: ts.Node, specifier: string, typeOnly: boolean) => {
    if (!specifier.startsWith(".")) {
      if (!BARE_ALLOWED.has(specifier)) flag(node, `bare import "${specifier}"`);
      return;
    }
    const target = rel(resolve(dirname(join(ROOT, file)), specifier));
    if (/-v14\b|\/v14\//.test(target) || target.startsWith("src/ui/")) flag(node, `V1.4 import "${specifier}"`);
    else if (target.startsWith("test/")) flag(node, `test-code import "${specifier}"`);
    else if (!ALLOWED_TARGETS.some((pattern) => pattern.test(target))) flag(node, `import of "${target}"`);
    else if (TYPE_ONLY_TARGETS.some((pattern) => pattern.test(target)) && !typeOnly) flag(node, `value import of "${target}" (types only)`);
  };

  const checkName = (node: ts.Node, name: string) => {
    if (FORBIDDEN_NAMES.has(name)) flag(node, `forbidden "${name}"`);
    if (HEAT_FIELDS.has(name) && !HEAT_FIELD_FILES.has(file)) flag(node, `heat field "${name}" outside the log templates`);
    if (name === "useEngineView" && !inDir(file, "decision", "state", "dev")) flag(node, `useEngineView outside decision/state/dev`);
    if ((name === "useSnapshot" || name === "useGameContext") && !inDir(file, "decision", "state", "dev") && file !== "src/app/App.tsx") {
      flag(node, `${name} outside decision/state/dev/App.tsx`);
    }
    if (name === "legalCommands" && !inDir(file, "dev")) flag(node, `legalCommands outside dev`);
    if (CONTENT_CONSTANTS.has(name) && !inDir(file, "i18n", "playtest")) flag(node, `content constant ${name} outside i18n/playtest`);
  };

  const rightmostName = (expression: ts.Expression): string | null => {
    if (ts.isIdentifier(expression)) return expression.text;
    if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
    if (ts.isNonNullExpression(expression) || ts.isParenthesizedExpression(expression)) return rightmostName(expression.expression);
    return null;
  };

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const typeOnly =
        clause !== undefined &&
        (clause.isTypeOnly ||
          (clause.name === undefined &&
            clause.namedBindings !== undefined &&
            ts.isNamedImports(clause.namedBindings) &&
            clause.namedBindings.elements.every((element) => element.isTypeOnly)));
      checkSpecifier(node, node.moduleSpecifier.text, typeOnly);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined && ts.isStringLiteral(node.moduleSpecifier)) {
      checkSpecifier(node, node.moduleSpecifier.text, node.isTypeOnly);
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (callee.kind === ts.SyntaxKind.ImportKeyword) {
        const [first] = node.arguments;
        if (first !== undefined && ts.isStringLiteral(first)) checkSpecifier(node, first.text, false);
        else flag(node, "dynamic import of a computed path");
      }
      if (ts.isPropertyAccessExpression(callee) && callee.name.text === "glob" && callee.expression.getText(sf) === "import.meta") {
        const [pattern, options] = node.arguments;
        if (!inDir(file, "dev")) flag(node, "import.meta.glob outside dev");
        const text = pattern !== undefined && ts.isStringLiteralLike(pattern) ? pattern.text : "";
        if (text.includes("test/") && !/^(\.\.\/)+test\/v161\/ui\/fixtures\/\*\.json$/.test(text)) flag(node, `glob of test code "${text}"`);
        // An eager glob is hoisted above the entry's stylesheet import (it would declare a cascade
        // layer before styles/index.css fixes the order, §7.2), and would bundle the fixtures.
        if (options !== undefined && /eager\s*:\s*true/.test(options.getText(sf))) flag(node, text.includes("test/") ? "eager glob of the test fixtures" : "eager import.meta.glob");
      }
    } else if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) {
      checkName(node, node.text);
    } else if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      const parent = node.parent;
      const isSpecifier = parent !== undefined && (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent));
      if (!isSpecifier) for (const word of node.text.match(/[A-Za-z_$][\w$]*/g) ?? []) if (FORBIDDEN_NAMES.has(word) || (HEAT_FIELDS.has(word) && !HEAT_FIELD_FILES.has(file))) flag(node, `forbidden string "${word}"`);
    }
    if (ts.isPropertyAccessExpression(node) && node.name.text === "firing" && rightmostName(node.expression) === "game") flag(node, "the pattern game.firing");
    if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression) && node.argumentExpression.text === "firing" && rightmostName(node.expression) === "game") {
      flag(node, "the pattern game[\"firing\"]");
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return offences;
}

// ── Tests ─────────────────────────────────────────────────────────────────────────────────

describe("boundary detectors", () => {
  const scan = (file: string, source: string) => offencesIn(file, source).map((offence) => offence.what);

  it("catch what they exist for, and ignore comments", () => {
    expect(scan("src/app/table/X.tsx", 'import { applyAction } from "../../game/index.ts";')).toEqual(['forbidden "applyAction"']);
    expect(scan("src/app/table/X.tsx", 'import { x } from "../../multiplayer/index.ts";')).toEqual(['import of "src/multiplayer/index.ts"']);
    expect(scan("src/app/table/X.tsx", 'import { x } from "../../multiplayer/computerPlayer.ts";')).toEqual(['import of "src/multiplayer/computerPlayer.ts"']);
    expect(scan("src/app/table/X.tsx", 'import { x } from "../../ui/App.tsx";')).toEqual(['V1.4 import "../../ui/App.tsx"']);
    expect(scan("src/app/table/X.tsx", 'import { x } from "../../game-v14/index.ts";')).toEqual(['V1.4 import "../../game-v14/index.ts"']);
    expect(scan("src/app/table/X.tsx", 'import { x } from "../../../test/v161/ui/support/fixtures.ts";')).toEqual(['test-code import "../../../test/v161/ui/support/fixtures.ts"']);
    expect(scan("src/app/table/X.tsx", 'import { PublicRoom } from "../../multiplayer/types.ts";')).toEqual(['value import of "src/multiplayer/types.ts" (types only)']);
    expect(scan("src/app/table/X.tsx", 'import type { PublicRoom } from "../../multiplayer/types.ts";')).toEqual([]);
    expect(scan("src/app/table/X.tsx", 'import zustand from "zustand";')).toEqual(['bare import "zustand"']);
    expect(scan("src/app/table/X.tsx", 'const n = board.counts["fireDeck"];')).toEqual(['forbidden string "fireDeck"']);
    expect(scan("src/app/table/X.tsx", "const { fireDeck } = counts;")).toEqual(['forbidden "fireDeck"']);
    expect(scan("src/app/table/X.tsx", "const f = view.game.firing;")).toEqual(["the pattern game.firing"]);
    expect(scan("src/app/table/X.tsx", 'const f = game["firing"];')).toEqual(['the pattern game["firing"]']);
    expect(scan("src/app/table/X.tsx", "const x = <div dangerouslySetInnerHTML={{ __html: s }} />;")).toEqual(['forbidden "dangerouslySetInnerHTML"']);
    expect(scan("src/app/table/X.tsx", "const v = useEngineView();")).toEqual(["useEngineView outside decision/state/dev"]);
    expect(scan("src/app/decision/X.tsx", "const v = useEngineView();")).toEqual([]);
    expect(scan("src/app/shell/X.tsx", "const s = useSnapshot();")).toEqual(["useSnapshot outside decision/state/dev/App.tsx"]);
    expect(scan("src/app/table/X.tsx", 'import { useSnapshot } from "../state/hooks.ts";')).toEqual(["useSnapshot outside decision/state/dev/App.tsx"]);
    expect(scan("src/app/lobby/X.tsx", "const { source } = useGameContext();")).toEqual(["useGameContext outside decision/state/dev/App.tsx"]);
    expect(scan("src/app/screens/X.tsx", "const v = useSnapshot().view;")).toEqual(["useSnapshot outside decision/state/dev/App.tsx"]);
    expect(scan("src/app/App.tsx", "const s = useSnapshot(); const c = useGameContext();")).toEqual([]);
    expect(scan("src/app/decision/X.tsx", "const s = useSnapshot(); const c = useGameContext();")).toEqual([]);
    expect(scan("src/app/dev/X.tsx", "const s = useSnapshot(); const c = useGameContext();")).toEqual([]);
    expect(scan("src/app/state/X.ts", "const s = useSnapshot(); const c = useGameContext();")).toEqual([]);
    expect(scan("src/app/shell/X.tsx", "const { log, lastBatch } = useLog();")).toEqual([]);
    expect(scan("src/app/decision/X.tsx", "const c = legalCommands(view, {});")).toEqual(["legalCommands outside dev"]);
    expect(scan("src/app/dev/X.tsx", "const c = legalCommands(view, {});")).toEqual([]);
    expect(scan("src/app/table/X.tsx", "const n = GAME_CONFIG.rounds;")).toEqual(["content constant GAME_CONFIG outside i18n/playtest"]);
    expect(scan("src/app/i18n/content.ts", "const n = GAME_CONFIG.rounds;")).toEqual([]);
    expect(scan("src/app/table/X.tsx", "const h = record.actualHeat;")).toEqual(['heat field "actualHeat" outside the log templates']);
    expect(scan("src/app/i18n/events.ts", "const h = record.actualHeat;")).toEqual([]);
    expect(scan("src/app/table/X.tsx", "// lastFiring, fireDeck and applyAction in a comment\nconst ok = 1;")).toEqual([]);
    expect(scan("src/app/table/X.tsx", 'const g = import.meta.glob("./*.json");')).toEqual(["import.meta.glob outside dev"]);
    expect(scan("src/app/dev/X.tsx", 'const g = import.meta.glob("../../../test/v161/ui/fixtures/*.json", { eager: true });')).toEqual(["eager glob of the test fixtures"]);
    expect(scan("src/app/dev/X.tsx", 'const g = import.meta.glob("../../../test/v161/ui/fixtures/*.json");')).toEqual([]);
    expect(scan("src/app/dev/X.tsx", 'const g = import.meta.glob("./*.gallery.tsx", { eager: true });')).toEqual(["eager import.meta.glob"]);
    expect(scan("src/app/dev/X.tsx", 'const g = import.meta.glob("../../../test/v161/ui/support/*.ts");')).toEqual(['glob of test code "../../../test/v161/ui/support/*.ts"']);
  });
});

describe("src/app import boundaries", () => {
  it("finds the app", () => {
    expect(SOURCES.length).toBeGreaterThan(100);
    expect(SOURCES.map(rel)).toEqual(expect.arrayContaining(["src/app/App.tsx", "src/app/state/hooks.ts", "src/app/decision/windows.ts"]));
  });

  it.each(SOURCES.map((path) => [rel(path), path] as const))("%s stays inside its boundaries", (file, path) => {
    expect(offencesIn(file, readFileSync(path, "utf8")).map((offence) => `${offence.line}: ${offence.what}`)).toEqual([]);
  });
});
