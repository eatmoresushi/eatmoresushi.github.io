/**
 * SSR of B4's windows from every scenario and moment, in English and Chinese
 * (UI_V1.6.1_ARCHITECTURE §9.2, §10.3 B4). Owner: B4.
 *
 * - Every work-phase and setup window (Kiln selection, Setter's Mark, the work turn before and
 *   after the worker action, the three Commission Market steps, the Guild Hall inspection, Colour
 *   Samples) renders its real component, never a phase A placeholder, with its title, its
 *   ConfirmBar alternative and the test-driver contract (input `name`/`value` = engine IDs).
 * - Owner decisions: no odds, previews or ladders (D3/D4); no lock wording (D7); no ceramic or
 *   worker ID in anything a player perceives (D9); every Order card and Recognition milestone
 *   shown in a form opens its rules details (D10) with only the full rule and that component's
 *   clarifications, as plain text: no card text, card facts or source labels (owner review,
 *   2026-10-17). The Kiln options and the work turn's locations carry no "Full rules" button any
 *   more, and the Guild Hall inspection shows each Tech as its printed tile (short text, timing in
 *   bold) with no rules details and no "Only you can see" pill (owner review, 2026-10-17).
 * - Workers are placed on the table (owner review, 2026-10-17): the pane lists no workers and no
 *   locations, and every legal placement has its Place shortcut on the table; the Guild Hall
 *   choice is made on the Tech display.
 * - Seeded drafts drive the table targets through `useTableSelection` (§3.5), so SSR sees the
 *   Place shortcuts, the Guild Hall chooser, kiln targets, pending chips and Order targets.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "../../support/glossary.ts";
import { KILNS, ORDERS, ORDER_CLARIFICATIONS, SHAPES, TECHS, guildInspectionOptions, guildOptions, legalCommands, placementOptions, settersMarkOptions, shortTextSegments } from "../../../../src/game/index.ts";
import type { AuthoritativeCommand, ClarificationDefinition, KilnId, KilnSpaceId, LocationId, OrderId, TechDiscipline, TechId } from "../../../../src/game/index.ts";
import { WINDOWS } from "../../../../src/app/decision/windows.ts";
import { workDraft } from "../../../../src/app/decision/work/workDraft.ts";
import { GameScreen } from "../../../../src/app/screens/GameScreen.tsx";
import { decisionWindow } from "../../../../src/app/state/decisionWindow.ts";
import type { DecisionWindowKind } from "../../../../src/app/state/decisionWindow.ts";
import { useTableSelection } from "../../../../src/app/state/hooks.ts";
import { buildGameModel, engineViewOf } from "../../../../src/app/state/model.ts";
import { placementWorkerKey } from "../../../../src/app/state/tableSelection.ts";
import { FixtureGameSource } from "../../../../src/app/session/fixtureSource.ts";
import { allFixtures, fixture, fixtureSource } from "../support/fixtures.ts";
import { disciplineName, kilnText, locationName, techText } from "../../../../src/app/i18n/content.ts";
import { createTranslator } from "../../../../src/app/i18n/translator.ts";
import { RulesDetail } from "../../../../src/app/rules/RulesDetail.tsx";
import { renderComponent, renderWindow } from "../support/render.tsx";
import { decode, panel, panels, textOf } from "../table/markup.ts";

const B4_KINDS: ReadonlySet<DecisionWindowKind> = new Set<DecisionWindowKind>(["kiln_selection", "setters_mark", "work", "commission", "guild_inspection", "colour_samples"]);

/** Every component B4 replaced (A2 rendered `<Placeholder name="…">` for each). */
const B4_STUBS = [
  "KilnSelection",
  "SettersMark",
  "WorkTurn",
  "ActionWindow",
  "ImperialPriority",
  "CommissionStep",
  "GuildInspection",
  "ColourSamples",
  "MaterialsYard",
  "FormDecorate",
  "GlazeLoad",
  "CommissionMarket",
  "GuildHall",
  "CanalWharf",
  "MagistratesHall",
];

const entries = allFixtures().filter((entry) => entry.viewerActs === true && B4_KINDS.has(decisionWindow(entry.playerView).kind));

/** What a player perceives: text nodes plus `aria-label`, `title` and `alt` values. */
function perceivable(html: string): string {
  const attributes = [...html.matchAll(/\s(?:aria-label|title|alt)="([^"]*)"/g)].map((match) => match[1]);
  return [html.replace(/<[^>]*>/g, " "), ...attributes].join(" ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ");
}

/** D3/D4 vocabulary (§9.2). */
const BANNED_EN = /\b(odds|chance|probability|ladder|preview|expected)\b|cards left|cards remaining|left in the deck/i;
const BANNED_ZH = /概率|几率|余张|预估|预览|剩余火牌|牌堆剩余/;
/** D7 (§6.4). */
const LOCK_EN = /\b(un)?lock/i;
const LOCK_ZH = /锁|封条|启封|封存|上锁|解锁/;
/** D9: ceramic IDs (`c12`) and worker IDs (`p1:apprentice:2`). */
const INTERNAL_ID = /\bc\d+\b|\bp\d+:(?:shifu|apprentice)\b/;

const en = (id: string, draft?: unknown) => renderWindow(fixtureSource(id), { locale: "en", ...(draft === undefined ? {} : { draft }) });
const zh = (id: string, draft?: unknown) => renderWindow(fixtureSource(id), { locale: "zh-CN", ...(draft === undefined ? {} : { draft }) });
const text = (html: string) => html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").trim();
const heading = (html: string) => text(/<h2 [^>]*class="pane-heading"[^>]*>(.*?)<\/h2>/.exec(html)?.[1] ?? "");
const alt = (html: string) => {
  const match = /data-action="alt"[^>]*>(.*?)<\/button>/.exec(html);
  return match === null ? null : text(match[1] ?? "");
};
const summary = (html: string) => text(/<p class="confirm-summary">(.*?)<\/p>/.exec(html)?.[1] ?? "");
/** Every `<input>` as its attributes. */
function inputs(html: string): Record<string, string>[] {
  return [...html.matchAll(/<input\b([^>]*)\/?>/g)].map((match) => Object.fromEntries([...(match[1] ?? "").matchAll(/([\w-]+)="([^"]*)"/g)].map((attr) => [attr[1]!, attr[2]!])));
}
const valuesOf = (html: string, name: string) => inputs(html).filter((input) => input["name"] === name).map((input) => input["value"]);
/** The rules-details panels (D10), by subject kind. */
/** The shared rules-details panels (D10) of one subject kind, as markup (label included). */
function rulesPanels(html: string, kind?: string): string[] {
  return panels(html)
    .filter((entry) => entry.html.includes("data-rules-detail") && (kind === undefined || entry.html.includes(`data-rules="${kind}"`)))
    .map((entry) => entry.html);
}

const EN = createTranslator("en", { strict: true });
const ZH = createTranslator("zh-CN", { strict: true });

/**
 * A rules-details panel shows only the full rule, then the component's clarifications as plain
 * text (owner review, 2026-10-17): no card text, card facts or source labels. The clarifications
 * come from the data, so the check holds however many a component keeps.
 */
function expectRuleAndClarifications(body: string, items: readonly ClarificationDefinition[], locale: "en" | "zh-CN") {
  const t = locale === "en" ? EN : ZH;
  const headings = [...body.matchAll(/<p class="rd-h">([^<]*)<\/p>/g)].map((match) => decode(match[1]!));
  expect(headings).toEqual([t("rules.fullRule"), ...(items.length > 0 ? [t("rules.clarifications")] : [])]);
  const plain = textOf(body);
  for (const item of items) expect(plain).toContain(decode(locale === "en" ? item.en : item.zh));
  expect(body, "card text").not.toContain("rd-short");
  expect(body, "card facts").not.toMatch(/<dl\b|<dt>/);
  expect(plain, "source label").not.toMatch(/Source:|出处：|Owner (ruling|amendment)|业主(裁定|修订)|Provisional ruling P\d|Wording D\d|Rulebook “|规则书「/);
}

/** One option card of a choice (its label and its rules trigger), by input name and value. */
function optionCard(html: string, name: string, value: string): string {
  const card = html.split('<div class="kit-opt ').find((part) => part.includes(`name="${name}" value="${value}"`));
  if (card === undefined) throw new Error(`no option ${name}=${value}`);
  return card;
}

/** "3 Coins", "1 Coin". */
const coinsEn = (n: number) => `${n} ${n === 1 ? "Coin" : "Coins"}`;

/** React's text escaping, for comparing markup with content strings. */
const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** One Tech tile of the Guild inspection (`TechOption`: its label and its reason), by Tech. */
function techTile(html: string, techId: string): string {
  const tile = html.split(/(?=<div class="tech tech--option)/).find((part) => part.startsWith('<div class="tech tech--option') && part.includes(`name="take" value="${techId}"`));
  if (tile === undefined) throw new Error(`no Tech tile ${techId}`);
  return tile.split("</fieldset>")[0] ?? tile;
}

/** The markup of the element with this id (a `<span>` or `<p>` without nested elements of its kind). */
function elementById(html: string, id: string): string {
  const match = new RegExp(`<(span|p) id="${escapeRegExp(id)}"[^>]*>([\\s\\S]*?)</\\1>`).exec(html);
  if (match === null) throw new Error(`no element #${id}`);
  return match[2]!;
}

const textById = (html: string, id: string) => textOf(elementById(html, id));

/** A stylesheet's style rules (innermost blocks, comments removed): selector list and declarations. */
function cssRules(css: string): Array<{ selectors: string[]; declarations: Record<string, string> }> {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selectors: match[1]!.split(",").map((selector) => selector.trim().replace(/\s+/g, " ")),
    declarations: Object.fromEntries([...match[2]!.matchAll(/([-\w]+)\s*:\s*([^;]+);/g)].map((declaration) => [declaration[1]!, declaration[2]!.trim()])),
  }));
}

/** The first canonical legal command of a type for a fixture's view. */
function commandOf(id: string, type: AuthoritativeCommand["type"], nth = 0): AuthoritativeCommand {
  const command = legalCommands(fixture(id).playerView, { mode: "canonical" }).filter((candidate) => candidate.type === type)[nth];
  if (command === undefined) throw new Error(`${id}: no ${type}`);
  return command;
}

/** The draft that builds a command, as the form would hold it (§9.4). */
function draftFor(id: string, command: AuthoritativeCommand): unknown {
  const view = fixture(id).playerView;
  const model = buildGameModel(view, []);
  const draft = WINDOWS[model.window.kind].draft.fromCommand(command, model, engineViewOf(view));
  if (draft === null) throw new Error(`${id}: cannot express ${command.type}`);
  return draft;
}

/** The work draft after a table Place shortcut (`act` → the draft action), as a player makes it. */
function placedDraft(id: string, locationId: LocationId, workerKey: string): unknown {
  const view = fixture(id).playerView;
  const model = buildGameModel(view, []);
  const engine = engineViewOf(view);
  const spec = WINDOWS.work;
  const initial = workDraft.initial(model, engine);
  const action = spec.table?.act(initial as never, { type: "place", locationId, workerKey }, model, engine);
  if (action === null || action === undefined) throw new Error(`${id}: the table does not place ${workerKey} at ${locationId}`);
  return workDraft.reduce(initial, action as never, model, engine);
}

const RICH = "w-before-the-worker-action-rich-4-player-start";
const DING = "w-before-the-worker-action-canal-barge-imperial-priority-with-reworking-table-ding";
const INVERTED = "w-before-the-worker-action-kiln-furniture-inverted-firing-targets-setters-marks-senior-apprentice";

describe("B4 windows render from every fixture", () => {
  it("covers every B4 window kind and both work steps", () => {
    const kinds = new Set(entries.map((entry) => decisionWindow(entry.playerView).kind));
    expect([...kinds].sort()).toEqual([...B4_KINDS].sort());
    const awaiting = new Set(entries.map((entry) => decisionWindow(entry.playerView)).flatMap((window) => (window.kind === "commission" ? [window.awaiting] : [])));
    expect([...awaiting].sort()).toEqual(["look_choice", "reservation", "resource"]);
  });

  it.each(entries.map((entry) => [entry.id] as const))("%s", (id) => {
    const window = decisionWindow(fixture(id).playerView);
    for (const locale of ["en", "zh-CN"] as const) {
      const html = locale === "en" ? en(id) : zh(id);
      expect(html).toContain(`data-window="${window.kind}"`);
      for (const stub of B4_STUBS) expect(html, stub).not.toContain(`data-placeholder="${stub}"`);
      expect(heading(html)).not.toBe("");
      const seen = perceivable(html);
      expect(seen).not.toMatch(locale === "en" ? BANNED_EN : BANNED_ZH);
      expect(seen).not.toMatch(locale === "en" ? LOCK_EN : LOCK_ZH);
      expect(seen, "internal ID").not.toMatch(INTERNAL_ID);
      expect(seen, "placeholder left").not.toMatch(/\{[a-z]+\}/i);
    }
  });
});

describe("titles, alternatives and the test-driver contract", () => {
  it("Kiln selection: every Kiln from kilnSelectionOptions, valued by Kiln ID, without a choosing-order list", () => {
    const html = en("m15_kiln_selection");
    expect(heading(html)).toBe("Choose your Kiln");
    expect(heading(zh("m15_kiln_selection"))).toBe("选择窑口");
    expect(valuesOf(html, "kilnId")).toEqual(Object.keys(KILNS));
    expect(alt(html)).toBeNull();
    // The owner removed the choosing-order list (review, 2026-10-17); the prompt still says reverse turn order.
    expect(perceivable(html)).not.toContain("Choosing order");
    expect(perceivable(html)).toContain("reverse turn order");
    expect(summary(html)).toBe("Choose a Kiln.");
  });

  it("Setter's Mark: the settersMarkOptions spaces, valued by space ID, with Decline as the alternative", () => {
    const id = "m10a_setters_mark_window";
    const html = en(id);
    expect(heading(html)).toBe("Place your Setter’s Mark");
    expect(valuesOf(html, "spaceId")).toEqual([...settersMarkOptions(fixture(id).playerView), "decline"]);
    expect(alt(html)).toBe("Decline");
    expect(alt(zh(id))).not.toBeNull();
  });

  it("work before the action: the pane lists no worker or location, and is hidden until the table chooses a placement (owner review, 2026-10-17)", () => {
    const html = en("m1_work_phase_r2_3p");
    expect(heading(html)).toBe("Place a worker");
    expect(heading(zh("m1_work_phase_r2_3p"))).toBe("派工");
    expect(html).toContain('data-step="before_action"');
    expect(valuesOf(html, "worker")).toEqual([]);
    expect(valuesOf(html, "locationId")).toEqual([]);
    expect(html).not.toContain("b4-unavailable");
    expect(perceivable(html)).not.toMatch(/Unavailable \(\d\)|Full rules/);
    // Hidden (hidden_pane.test.tsx): no "Go to…" hint any more.
    expect(html).toMatch(/<aside class="pane"[^>]*hidden=""/);
    expect(html).not.toMatch(/data-b4="place-hint"|data-goto="table"|data-goto="workshop"/);
    expect(alt(html)).toBeNull();
    expect(summary(html)).toBe("Place a worker on an open action space.");
  });

  it("work before the action: every legal placement has its Place shortcut on the table, Senior Apprentice and personal spaces included", () => {
    for (const id of [RICH, "m1_work_phase_r2_3p", "m5_two_player_board_2p", INVERTED, DING]) {
      const html = renderComponent(fixtureSource(id), <GameScreen />);
      const shortcuts = [...html.matchAll(/<button[^>]*data-act="place"[^>]*>/g)].map((match) => {
        const tag = match[0];
        return `${/data-location-id="([^"]+)"/.exec(tag)?.[1] ?? ""}:${/data-worker="([^"]+)"/.exec(tag)?.[1] ?? ""}`;
      });
      const legal = placementOptions(fixture(id).playerView).flatMap((option) => option.workers.filter((worker) => worker.legal).map((worker) => `${option.locationId}:${placementWorkerKey(worker)}`));
      expect(legal.length, id).toBeGreaterThan(0);
      expect(shortcuts.sort(), id).toEqual(legal.sort());
    }
    const rich = renderComponent(fixtureSource(RICH), <GameScreen />);
    expect(rich).toMatch(/data-worker="apprentice-senior"[^>]*aria-label="Place Apprentice, as Shifu \(Senior Apprentice\) at Materials Yard"/);
    // An unavailable location gives the engine's reason on the table (CR B2-3); D7 on the board.
    const two = renderComponent(fixtureSource("m5_two_player_board_2p"), <GameScreen />);
    expect(perceivable(two)).toContain("Can’t place here");
    expect(perceivable(two)).toContain("Learn a Glazing & Loading Tech to add this space");
  });

  it("work before the action: a chosen placement shows its summary and sub-editor, with no location rules details", () => {
    const id = "m1_work_phase_r2_3p";
    const html = en(id, draftFor(id, commandOf(id, "PLACE_CANAL_WHARF")));
    expect(html).toContain('data-b4="chosen"');
    expect(html).not.toContain('data-b4="place-hint"');
    expect(perceivable(html)).toMatch(/(Shifu|Apprentice) at Canal Wharf/);
    expect(html).toMatch(/<div class="b4-sub-region" role="group" aria-label="Canal Wharf">/);
    expect(rulesPanels(html, "location")).toEqual([]);
    expect(perceivable(zh(id, draftFor(id, commandOf(id, "PLACE_CANAL_WHARF"))))).toMatch(/派(师傅|学徒)到漕运码头/);
  });

  it("work before the action: Imperial Priority and Canal Barge may come first", () => {
    // Placing a worker is one of the step's choices only while a placement is chosen (owner
    // review, 2026-10-17): nothing chosen hides the pane, and choosing it from an open ability
    // would hide the pane under the player's arrow keys.
    expect(valuesOf(en(DING), "mode")).toEqual(["imperial_priority", "canal_barge"]);
    expect(valuesOf(en(DING, placedDraft(DING, "canal_wharf", "shifu")), "mode")).toEqual(["place", "imperial_priority", "canal_barge"]);
    expect(en(DING)).not.toContain('data-b4="back-to-placing"');
    const view = fixture(DING).playerView;
    const model = buildGameModel(view, []);
    const engine = engineViewOf(view);
    const ability = workDraft.reduce(workDraft.initial(model, engine), { type: "mode", mode: "imperial_priority" }, model, engine);
    expect(en(DING, ability)).toMatch(/<button[^>]*data-b4="back-to-placing"[^>]*>Back to placing a worker<\/button>/);
    expect(zh(DING, ability)).toMatch(/data-b4="back-to-placing"[^>]*>返回派工</);
    // The heading follows what the pane shows: never "Place a worker" beside "Back to placing".
    expect(heading(en(DING, ability))).toBe("Before your worker action");
    expect(heading(zh(DING, ability))).toBe("工人行动之前");
    expect(heading(en(DING, placedDraft(DING, "canal_wharf", "shifu")))).toBe("Place a worker");
  });

  it("work before the action: the only ability that may come first, opened with nothing placed, has no lone radio and names the heading", () => {
    const view = fixture(RICH).playerView;
    const model = buildGameModel(view, []);
    const engine = engineViewOf(view);
    const barge = workDraft.reduce(workDraft.initial(model, engine), { type: "mode", mode: "canal_barge" }, model, engine);
    expect(valuesOf(en(RICH), "mode")).toEqual([]);
    expect(valuesOf(en(RICH, barge), "mode")).toEqual([]);
    expect(perceivable(en(RICH, barge))).not.toContain("This step");
    expect(perceivable(zh(RICH, barge))).not.toContain("此步");
    expect(heading(en(RICH, barge))).toBe("Canal Barge");
    expect(heading(zh(RICH, barge))).toBe("漕船");
    expect(en(RICH, barge)).toContain('data-b4="back-to-placing"');
    expect(valuesOf(en(RICH, placedDraft(RICH, "canal_wharf", "shifu")), "mode")).toEqual(["place", "canal_barge"]);
  });

  it("work after the action: End turn is the alternative and a mode choice", () => {
    const html = en("w-after-the-worker-action");
    expect(heading(html)).toBe("After your worker action");
    expect(html).toContain('data-step="after_action"');
    expect(valuesOf(html, "mode")).toEqual(["imperial_priority", "canal_barge", "end_turn"]);
    expect(alt(html)).toBe("End turn");
    expect(alt(zh("w-after-the-worker-action"))).toBe("结束回合");
    // A single choice is preselected: Confirm ends the turn.
    expect(summary(en("m17_after_action"))).toBe("End your turn");
  });

  it("Commission steps: reserve again or stop, the private look, the gain", () => {
    const again = en("w-commission-market-second-reservation-or-stop");
    expect(heading(again)).toBe("Reserve another Order");
    expect(alt(again)).toBe("Stop: reserve no more");
    expect(valuesOf(again, "reserve")).toEqual(expect.arrayContaining(["blind", "stop"]));
    const look = en("m2_commission_market_look_r3_4p");
    expect(heading(look)).toBe("Choose an Order to reserve");
    expect(perceivable(look)).toContain("Only you can see");
    expect(perceivable(look)).toMatch(/Others see .* is looking at \d Orders/);
    expect(alt(look)).toBeNull();
    const gain = en("w-commission-market-resource-after-a-blind-reservation");
    expect(heading(gain)).toBe("Choose your gain");
    expect(valuesOf(gain, "resource")).toEqual(["clay", "wood", "coins"]);
    expect(perceivable(zh("w-commission-market-resource-after-a-blind-reservation"))).toContain("1泥");
  });

  it("Commission steps show the Order already reserved this turn and the gain still to come (wireframe m2)", () => {
    const look = en("m2_commission_market_look_r3_4p");
    expect(perceivable(look)).toContain("Already reserved this turn");
    expect(perceivable(look)).toContain("#1 O32");
    expect(perceivable(look)).toContain("Next: gain 1 Clay, 1 Wood or 1 Coin");
    expect(rulesPanels(look, "order").some((panel) => panel.includes("O32"))).toBe(true);
    const lookZh = perceivable(zh("m2_commission_market_look_r3_4p"));
    expect(lookZh).toContain("本回合已承接");
    expect(lookZh).toContain("下一步：获得1泥、1柴或1铜钱");
    const again = en("w-commission-market-second-reservation-or-stop");
    expect(perceivable(again)).toContain("Already reserved this turn");
    expect(perceivable(again)).toContain("#1 O01");
    expect(perceivable(again)).not.toContain("Next: gain");
    expect(perceivable(en("w-commission-market-second-reservation-or-stop", { reserve: "blind", gain: null, looked: null, resource: null }))).toContain("Next: gain 1 Clay, 1 Wood or 1 Coin");
    const blind = perceivable(en("w-commission-market-resource-after-a-blind-reservation"));
    expect(blind).toContain("Already reserved this turn");
    expect(blind).toContain("O07");
    expect(blind).toContain("Blind, from the top of the deck");
    expect(perceivable(en("w-commission-market-top-3-choice"))).not.toContain("Already reserved this turn");
  });

  it("Form & Decorate renders an unavailable Shape as unavailable with the engine's reason (0 Clay, Large Throwing Wheel)", () => {
    const entry = structuredClone(fixture(DING));
    const p = entry.playerView.game.players[entry.viewerId];
    if (p === undefined) throw new Error("no viewer");
    p.resources.clay = 0;
    p.techs = p.techs.map((tech) => (tech.id === "T05" ? { ...tech, id: "T01" } : tech));
    const view = entry.playerView;
    const model = buildGameModel(view, []);
    const base = workDraft.initial(model, engineViewOf(view));
    const draft = workDraft.reduce(
      workDraft.reduce(base, { type: "worker", workerKey: "shifu" }, model, engineViewOf(view)),
      { type: "location", locationId: "form_decorate" },
      model,
      engineViewOf(view),
    );
    const html = renderWindow(new FixtureGameSource(entry), { locale: "en", draft });
    const shapes = inputs(html).filter((input) => input["name"] === "vessels.0.shape");
    expect(shapes.filter((input) => input["aria-disabled"] === "true").map((input) => input["value"])).toEqual(["bowl", "plate", "washer"]);
    expect(perceivable(html)).toMatch(/Not enough Clay/);
    expect(valuesOf(html, "secondVessel")).toEqual([]);
    expect(valuesOf(html, "dingExtra")).toEqual([]);
  });

  it("Guild inspection: take one Tech, then a Move up / Move down bottom order; no Only you can see pill (owner review, 2026-10-17)", () => {
    const html = en("m12_guild_shifu_inspection");
    expect(heading(html)).toBe("Take a Tech");
    expect(perceivable(html)).not.toContain("Only you can see");
    expect(html).not.toContain("kit-chip--private");
    expect(perceivable(zh("m12_guild_shifu_inspection"))).not.toContain("仅你可见");
    expect(perceivable(html)).toContain("Only you know this order.");
    expect(html).toMatch(/aria-label="Move [^"]+ (up|down)"/);
  });

  it("Colour Samples: one of the looked-at Orders, only you", () => {
    const html = en("m16_colour_samples");
    expect(heading(html)).toBe("Colour Samples: reserve an Order");
    expect(perceivable(html)).toContain("Only you can see");
    expect(alt(html)).toBeNull();
  });
});

describe("sub-editors from seeded drafts", () => {
  it("Materials Yard: the splits, the Shifu bonus and the engine quote's resources after", () => {
    const id = RICH;
    const draft = draftFor(id, commandOf(id, "PLACE_MATERIALS_YARD"));
    const html = en(id, draft);
    expect(html).toContain('data-location="materials_yard"');
    expect(valuesOf(html, "clay").length).toBeGreaterThan(1);
    expect(perceivable(html)).toContain("After this action");
    expect(summary(html)).toMatch(/^Place .+ at Materials Yard — \d Clay \+ \d Wood/);
  });

  it("Form & Decorate: Shapes and Decorations with printed costs, and the live quote", () => {
    const id = DING;
    const draft = draftFor(id, commandOf(id, "PLACE_FORM_DECORATE", 3));
    const html = en(id, draft);
    expect(html).toContain('data-location="form_decorate"');
    expect(valuesOf(html, "vessels.0.shape")).toEqual([...SHAPES]);
    expect(perceivable(html)).toContain("You pay");
    expect(perceivable(html)).toContain("Moulded Production");
    expect(perceivable(zh(id, draft))).toContain("共付");
  });

  it("Glaze & Load: vessels in words (identical ones told apart), Glazes, places and the Imperial modifier", () => {
    const id = DING;
    const command = commandOf(id, "PLACE_GLAZE_LOAD", 3);
    const html = en(id, draftFor(id, command));
    expect(html).toContain('data-location="glaze_load"');
    const seen = perceivable(html);
    expect(seen).toContain("Bowl, Plain (1 of 2)");
    expect(seen).toContain("Bowl, Plain (2 of 2)");
    expect(perceivable(zh(id, draftFor(id, command)))).toContain("同款2件中第1件");
    expect(seen).toContain("Your Imperial Kiln");
    expect(seen).toMatch(/Imperial modifier −1/);
    expect(summary(html)).toMatch(/Imperial Kiln \(−1\)$/);
  });

  it("Glaze & Load with the Shifu: the Heat marker targets, face down", () => {
    const id = INVERTED;
    const command = legalCommands(fixture(id).playerView, { mode: "canonical" }).find((candidate) => candidate.type === "PLACE_GLAZE_LOAD" && candidate.heatMarkerCeramicId !== undefined);
    if (command === undefined) throw new Error("no marker command");
    const html = en(id, draftFor(id, command));
    expect(valuesOf(html, "heatMarkerCeramicId")).toContain("none");
    expect(summary(html)).toContain("Heat marker face down on");
  });

  it("Guild Hall: the pane lists no Techs; it shows the choice made on the Tech display, or asks for one", () => {
    const id = "m5_two_player_board_2p";
    const command = commandOf(id, "PLACE_GUILD_HALL");
    if (command.type !== "PLACE_GUILD_HALL" || command.choice.kind !== "buy_face_up") throw new Error("expected an Apprentice purchase");
    const chosen = en(id, draftFor(id, command));
    expect(chosen).toContain(`data-guild-choice="${command.choice.techId}"`);
    expect(perceivable(chosen)).toContain(techText(command.choice.techId, "en").name);
    expect(perceivable(chosen)).toMatch(/\d Coins?/);
    expect(chosen).toMatch(/data-goto="techs"[^>]*>Change it on the Advanced Techs display</);
    // No Tech list, no Tech radios and no Tech rules details in the pane.
    expect(valuesOf(chosen, "techId")).toEqual([]);
    expect(rulesPanels(chosen, "tech")).toEqual([]);
    // Placed but not chosen yet: a prompt to choose on the table, and the way there.
    const asked = en(id, placedDraft(id, "guild_hall", "apprentice"));
    expect(perceivable(asked)).toContain("Choose a face-up Tech on the Advanced Techs display.");
    expect(asked).toMatch(/data-goto="techs"[^>]*>Go to the Advanced Techs</);
    expect(summary(asked)).toBe("Place Apprentice at Guild Hall");
    // The Shifu inspects a discipline: named in the pane, privately.
    const shifu = legalCommands(fixture(INVERTED).playerView, { mode: "canonical" }).find((candidate) => candidate.type === "PLACE_GUILD_HALL" && candidate.choice.kind === "inspect");
    if (shifu === undefined || shifu.type !== "PLACE_GUILD_HALL" || shifu.choice.kind !== "inspect") throw new Error("no inspection");
    const inspect = en(INVERTED, draftFor(INVERTED, shifu));
    expect(perceivable(inspect)).toContain(`Inspect the ${disciplineName(shifu.choice.discipline, "en")} deck`);
    expect(perceivable(inspect)).toContain("Only you will see the inspected Techs.");
    expect(perceivable(zh(INVERTED, draftFor(INVERTED, shifu)))).toContain(`查看${disciplineName(shifu.choice.discipline, "zh-CN")}牌堆顶`);
  });

  it("Commission Market, Guild Hall, Canal Wharf and Magistrate's Hall", () => {
    const cm = en(RICH, draftFor(RICH, commandOf(RICH, "PLACE_COMMISSION_MARKET")));
    expect(cm).toContain('data-location="commission_market"');
    expect(perceivable(cm)).toContain("A reserved position stays empty until your turn ends.");
    const cw = draftFor("m1_work_phase_r2_3p", commandOf("m1_work_phase_r2_3p", "PLACE_CANAL_WHARF"));
    expect(perceivable(en("m1_work_phase_r2_3p", cw))).toMatch(/Gain \d Coins/);
    expect(perceivable(zh("m1_work_phase_r2_3p", cw))).toMatch(/得\d铜钱/);
    const mh = en(RICH, draftFor(RICH, commandOf(RICH, "PLACE_MAGISTRATES_HALL")));
    expect(perceivable(mh)).toMatch(/Imperial Recognition \d → \d/);
    expect(rulesPanels(mh, "recognition").length).toBeGreaterThan(0);
    const gh = en("m5_two_player_board_2p", draftFor("m5_two_player_board_2p", commandOf("m5_two_player_board_2p", "PLACE_GUILD_HALL")));
    expect(gh).toContain('data-location="guild_hall"');
  });

  it("Imperial Priority before the action: vessel, Reworking Table, Glaze, Imperial modifier", () => {
    const html = en(DING, draftFor(DING, commandOf(DING, "USE_IMPERIAL_PRIORITY")));
    expect(html).toContain('data-b4="imperial-priority"');
    expect(valuesOf(html, "imperialModifier")).toEqual(["-1", "0", "1"]);
    expect(summary(html)).toMatch(/^Imperial Priority: .+ Imperial modifier/);
  });
});

describe("rules details (D10)", () => {
  it("every Kiln board in Kiln selection: name, ability name and the short text in bold, with no Full rules button (owner review, 2026-10-17)", () => {
    for (const locale of ["en", "zh-CN"] as const) {
      const html = locale === "en" ? en("m15_kiln_selection") : zh("m15_kiln_selection");
      expect(rulesPanels(html, "kiln")).toEqual([]);
      expect(html).not.toContain("kit-detail-trigger");
      expect(perceivable(html)).not.toContain(locale === "en" ? "Full rules" : "完整规则");
      for (const kilnId of Object.keys(KILNS) as KilnId[]) {
        const kiln = kilnText(kilnId, locale);
        const card = optionCard(html, "kilnId", kilnId);
        const label = card.split("</label>")[0] ?? "";
        expect(textOf(label)).toContain(decode(kiln.name));
        expect(textOf(label)).toContain(decode(kiln.abilityName));
        // The option itself carries the card text with its timing in bold.
        expect(label).toMatch(/<span class="b4-kiln-short"><strong>[^<]+[:：]<\/strong>/);
      }
    }
  });

  it("the work turn opens no location rules details: neither the pane nor a chosen placement (owner review, 2026-10-17)", () => {
    expect(rulesPanels(en("m1_work_phase_r2_3p"), "location")).toEqual([]);
    for (const type of ["PLACE_MATERIALS_YARD", "PLACE_CANAL_WHARF", "PLACE_FORM_DECORATE", "PLACE_GLAZE_LOAD", "PLACE_MAGISTRATES_HALL"] as const) {
      const html = en(RICH, draftFor(RICH, commandOf(RICH, type)));
      expect(rulesPanels(html, "location"), type).toEqual([]);
      expect(html, type).not.toMatch(/aria-label="Full rules: (Materials Yard|Canal Wharf|Form &amp; Decorate|Glaze &amp; Load|Magistrate)/);
    }
  });

  it("every Tech in the Guild inspection is a tile as printed: a radio named by its name and Shifu price, described by its discipline and short text, opening no rules details (owner review, 2026-10-17)", () => {
    for (const id of ["m12_guild_shifu_inspection", "w-guild-hall-shifu-inspection"]) {
      const options = guildInspectionOptions(fixture(id).playerView);
      expect(options, id).not.toBeNull();
      const all = [...options!.inspected, ...options!.faceUp];
      expect(all.length, id).toBeGreaterThan(1);
      for (const locale of ["en", "zh-CN"] as const) {
        const pane = locale === "en" ? en(id) : zh(id);
        // The inspection form itself (the pane's header and ConfirmBar aside).
        const html = pane.slice(pane.indexOf('data-b4="guild-inspection"'));
        expect(html.length, id).toBeLessThan(pane.length);
        // No rules details and no "Full rules" button anywhere in the inspection.
        expect(rulesPanels(html), `${id} ${locale}`).toEqual([]);
        expect(html).not.toContain("kit-detail");
        expect(perceivable(html)).not.toContain(locale === "en" ? "Full rules" : "完整规则");
        // The inspected Techs first, then the face-up ones, each one radio of the take group.
        expect(valuesOf(html, "take")).toEqual(all.map((option) => option.techId));
        for (const option of all) {
          const what = `${id} ${locale} ${option.techId}`;
          const tile = techTile(html, option.techId);
          const input = inputs(tile)[0]!;
          expect(input, what).toMatchObject({ class: "tech-radio", type: "radio", name: "take", value: option.techId });
          expect(input["aria-disabled"], what).toBe(option.legal ? undefined : "true");
          // The radio mark sits beside the face, outside its title row, so that row can wrap the
          // price under the name (CSS checked below) without leaving the mark alone on a line.
          expect(tile, what).toMatch(/^<div [^>]*><label class="tech-pick"><input [^>]*><span class="tech-mark" aria-hidden="true"><\/span><span class="tech-face"><span class="tech-t1"><span id="[^"]+" class="tech-name">/);
          expect(/^<div class="([^"]*)"/.exec(tile)?.[1], what).toBe(option.legal ? "tech tech--option" : "tech tech--option tech--unavailable");
          // Named by the Tech's name and its price: the Shifu's −1 Coin (minimum 0), printed cost first.
          const [nameId, priceId, ...restNamed] = (input["aria-labelledby"] ?? "").split(" ");
          expect(restNamed, what).toEqual([]);
          expect(textById(tile, nameId!), what).toBe(techText(option.techId, locale).name);
          expect(option.price).toBe(Math.max(0, option.printedCost - 1));
          if (locale === "en") {
            expect(textById(tile, priceId!), what).toBe(option.price === option.printedCost ? coinsEn(option.price) : `${coinsEn(option.printedCost)} → ${coinsEn(option.price)}`);
          } else {
            expect(textById(tile, priceId!), what).toBe(option.price === option.printedCost ? `${option.price}铜钱` : `${option.printedCost}铜钱 → ${option.price}铜钱`);
          }
          // Described by the engine's reason (when it cannot be taken), the discipline and the short text.
          const described = (input["aria-describedby"] ?? "").split(" ");
          const [discId, shortId] = option.legal ? described : described.slice(1);
          expect(described, what).toHaveLength(option.legal ? 2 : 3);
          if (!option.legal) {
            expect(tile, what).toMatch(new RegExp(`<p id="${escapeRegExp(described[0]!)}" class="tech-why">`));
            if (locale === "en") expect(textById(tile, described[0]!), what).toMatch(/You already own|Not enough|at most/);
          } else {
            expect(tile, what).not.toContain("tech-why");
          }
          expect(textById(tile, discId!), what).toBe(disciplineName(option.discipline, locale));
          const short = techText(option.techId, locale).short;
          expect(textOf(elementById(tile, shortId!)), what).toBe(textOf(short));
          const bold = shortTextSegments(short).filter((segment) => segment.emphasis);
          expect(bold.length, what).toBeGreaterThan(0);
          for (const segment of bold) expect(elementById(tile, shortId!), what).toContain(`<strong>${escapeHtml(segment.text)}</strong>`);
        }
      }
    }
  });

  it("a Tech tile keeps its name readable and its timing clause bold: the title row wraps the price under the name, and a greyed tile keeps the short text's weights (review, 2026-10-17)", () => {
    const css = cssRules(readFileSync(join(ROOT, "src/app/table/TechCard.css"), "utf8"));
    const declared = (selector: string, property: string) => css.filter((rule) => rule.selectors.includes(selector) && rule.declarations[property] !== undefined).map((rule) => rule.declarations[property]);
    // 200% text on a phone: the price no longer squeezes the name to a few letters per line.
    expect(declared(".tech-t1", "flex-wrap")).toEqual(["wrap"]);
    expect(declared(".tech-name", "flex")).toEqual([expect.stringMatching(/^1 1 \d+(\.\d+)?em$/)]);
    expect(declared(".tech-name", "min-width")).toEqual(["0"]);
    expect(declared(".tech-cost", "white-space")).toEqual(["nowrap"]);
    // The timing clause is bold on every tile, greyed (unavailable) ones included.
    expect(declared(".tech-short strong", "font-weight")).toEqual(["700"]);
    for (const selector of [".tech--unavailable .tech-short", ".tech--unavailable .tech-short strong"]) {
      expect(declared(selector, "font-weight"), selector).toEqual([]);
      expect(declared(selector, "color"), selector).toEqual(["var(--ink-2)"]);
    }
  });

  it("a Form & Decorate or Glazing & Loading Tech keeps D7 wording on its inspection tile and in its rules details, with no \"Adds\" fact", () => {
    const id = "w-guild-hall-shifu-inspection";
    const html = en(id);
    const zhHtml = zh(id);
    expect(TECHS.T16.unlocks).toBe("form_decorate");
    expect(TECHS.T10.unlocks).toBe("glaze_load");
    expect(TECHS.T13.unlocks).toBeNull();
    const details = (techId: TechId, locale: "en" | "zh-CN") => renderComponent(fixtureSource(id), <RulesDetail subject={{ kind: "tech", id: techId }} />, { locale });
    for (const techId of ["T16", "T10", "T13"] as TechId[]) {
      expect(textOf(techTile(html, techId))).not.toMatch(LOCK_EN);
      expect(textOf(techTile(zhHtml, techId))).not.toMatch(LOCK_ZH);
      const body = panel(details(techId, "en"), `Full rules: ${techText(techId, "en").name}`);
      expect(textOf(body)).toContain(decode(techText(techId, "en").ability));
      expect(body).not.toContain("<dt>Adds</dt>");
      expect(textOf(body)).not.toMatch(LOCK_EN);
      expectRuleAndClarifications(body, TECHS[techId].clarifications, "en");
      const zhBody = panel(details(techId, "zh-CN"), `完整规则：${techText(techId, "zh-CN").name}`);
      expect(zhBody).not.toContain("<dt>添设</dt>");
      expect(textOf(zhBody)).not.toMatch(LOCK_ZH);
      expectRuleAndClarifications(zhBody, TECHS[techId].clarifications, "zh-CN");
    }
  });

  it("every Order card in a choice: requirements and quality line, then the deck's clarifications, with no reward or Order kind", () => {
    for (const id of ["m2_commission_market_look_r3_4p", "m16_colour_samples", "w-commission-market-second-reservation-or-stop"]) {
      const html = en(id);
      const found = panels(html).filter((entry) => entry.html.includes('data-rules="order"'));
      expect(found.length, id).toBeGreaterThan(0);
      for (const entry of found) {
        const orderId = /^Full rules: Order ([OS]\d{2})$/.exec(entry.label)?.[1] as OrderId | undefined;
        expect(orderId, entry.label).toBeDefined();
        const order = ORDERS[orderId!];
        expect(textOf(entry.html)).toContain(decode(order.requirements));
        expect(textOf(entry.html)).not.toMatch(/Reward \d+ VP|\d+ VP · \d+ Coins?/);
        expectRuleAndClarifications(entry.html, order.deck === "starting" ? ORDER_CLARIFICATIONS.starting : ORDER_CLARIFICATIONS.main, "en");
      }
    }
  });

  it("the Full rules button is named for its component and sits outside every option label (§8.1)", () => {
    const id = "m16_colour_samples";
    const html = en(id);
    const first = valuesOf(html, "orderId")[0];
    expect(first).toBeDefined();
    expect(html).toContain(`aria-label="Full rules: Order ${first}"`);
    expect(html).not.toMatch(/aria-label="Rules: /);
    expect(zh(id)).toContain(`aria-label="完整规则：委托${first}"`);
    for (const label of html.split("<label").slice(1).map((part) => part.split("</label>")[0] ?? "")) expect(label).not.toContain("kit-detail-trigger");
  });
});

/** Writes the table selection the seeded draft drives (§3.5). */
function SelectionProbe() {
  const selection = useTableSelection();
  const data = {
    interactive: selection.interactive,
    place: [...selection.placeTargets.entries()].map(([locationId, workers]) => [locationId, workers.map(placementWorkerKey)]),
    active: selection.activePlacement,
    kiln: [...selection.kilnTargets.entries()],
    pending: selection.pendingCeramics,
    orders: [...selection.orderTargets.entries()],
    highlighted: [...selection.highlightedCeramicIds].sort(),
    chooser:
      selection.techChooser === null
        ? null
        : { mode: selection.techChooser.mode, worker: selection.techChooser.worker, techs: [...selection.techChooser.techs.entries()], disciplines: [...selection.techChooser.disciplines.entries()] },
  };
  return <pre data-probe="">{JSON.stringify(data)}</pre>;
}

interface Probed {
  interactive: boolean;
  place: Array<[LocationId, string[]]>;
  active: { locationId: LocationId; workerKey: string } | null;
  kiln: Array<[KilnSpaceId, { pressed: boolean }]>;
  pending: Array<{ ceramicId: string; glaze: string; at: string }>;
  orders: Array<[string, { state: string; disabled: boolean }]>;
  highlighted: string[];
  chooser: {
    mode: "buy" | "inspect";
    worker: { kind: string; seniorApprentice: boolean };
    techs: Array<[TechId, { pressed: boolean; legal: boolean; reason: { code: string } | null; printedCost: number; price: number }]>;
    disciplines: Array<[TechDiscipline, { pressed: boolean }]>;
  } | null;
}

function probe(id: string, draft?: unknown): Probed {
  const html = renderComponent(fixtureSource(id), <SelectionProbe />, draft === undefined ? {} : { draft });
  const json = /<pre data-probe="">(.*)<\/pre>/.exec(html)?.[1] ?? "{}";
  return JSON.parse(json.replace(/&quot;/g, '"').replace(/&amp;/g, "&")) as Probed;
}

describe("table targets from seeded drafts (§3.5)", () => {
  it("work: every worker entry per location, legal or not (CR B2-3); the draft's placement is active", () => {
    const view = fixture(RICH).playerView;
    const initial = probe(RICH);
    expect(initial.interactive).toBe(true);
    const entries = placementOptions(view).map((option) => [option.locationId, option.workers.map(placementWorkerKey)] as const);
    expect(initial.place).toEqual(entries);
    expect(initial.active).toBeNull();
    const draft = draftFor(RICH, commandOf(RICH, "PLACE_CANAL_WHARF"));
    const placed = probe(RICH, draft);
    expect(placed.active?.locationId).toBe("canal_wharf");
  });

  it("work: a Guild Hall Apprentice makes every face-up Tech a target, legal or not, with the engine's reason", () => {
    const id = "m5_two_player_board_2p";
    const view = fixture(id).playerView;
    expect(probe(id).chooser).toBeNull();
    const placed = probe(id, placedDraft(id, "guild_hall", "apprentice"));
    expect(placed.active).toEqual({ locationId: "guild_hall", workerKey: "apprentice" });
    expect(placed.chooser?.mode).toBe("buy");
    expect(placed.chooser?.disciplines).toEqual([]);
    const offered = guildOptions(view, "apprentice").faceUp;
    expect(placed.chooser?.techs.map(([techId, target]) => [techId, target.legal, target.reason?.code ?? null, target.price])).toEqual(
      offered.map((option) => [option.techId, option.legal, option.reason, option.price]),
    );
    expect(offered.some((option) => !option.legal) && offered.some((option) => option.legal)).toBe(true);
    // A click on a legal Tech chooses it; the chosen one is pressed.
    const legal = offered.find((option) => option.legal)!;
    const model = buildGameModel(view, []);
    const engine = engineViewOf(view);
    const draft = placedDraft(id, "guild_hall", "apprentice");
    const action = WINDOWS.work.table!.act(draft as never, { type: "tech", techId: legal.techId }, model, engine);
    const chosen = workDraft.reduce(draft as never, action as never, model, engine);
    expect(Object.fromEntries(probe(id, chosen).chooser!.techs)[legal.techId]?.pressed).toBe(true);
    expect(workDraft.build(chosen, model, engine)).toEqual({ type: "PLACE_GUILD_HALL", workerId: expect.any(String), choice: { kind: "buy_face_up", techId: legal.techId } });
    // An illegal Tech is never chosen, even if a click reached the draft.
    const illegal = offered.find((option) => !option.legal)!;
    const refused = workDraft.reduce(draft as never, WINDOWS.work.table!.act(draft as never, { type: "tech", techId: illegal.techId }, model, engine) as never, model, engine);
    expect(workDraft.build(refused, model, engine)).toBeNull();
  });

  it("work: a Guild Hall Shifu makes each discipline's deck a target to inspect; other placements have no chooser", () => {
    const view = fixture(INVERTED).playerView;
    const placed = probe(INVERTED, placedDraft(INVERTED, "guild_hall", "shifu"));
    expect(placed.chooser?.mode).toBe("inspect");
    expect(placed.chooser?.techs).toEqual([]);
    expect(placed.chooser?.disciplines.map(([discipline]) => discipline)).toEqual(guildOptions(view, "shifu").inspect.map((entry) => entry.discipline));
    const model = buildGameModel(view, []);
    const engine = engineViewOf(view);
    const draft = placedDraft(INVERTED, "guild_hall", "shifu");
    const chosen = workDraft.reduce(draft as never, WINDOWS.work.table!.act(draft as never, { type: "inspect", discipline: "firing" }, model, engine) as never, model, engine);
    expect(Object.fromEntries(probe(INVERTED, chosen).chooser!.disciplines)["firing"]).toEqual({ pressed: true });
    expect(workDraft.build(chosen, model, engine)).toMatchObject({ type: "PLACE_GUILD_HALL", choice: { kind: "inspect", discipline: "firing" } });
    expect(probe(INVERTED, placedDraft(INVERTED, "canal_wharf", "shifu")).chooser).toBeNull();
  });

  it("work: a Glaze & Load draft gives kiln targets, pending chips and highlighted vessels", () => {
    const view = fixture(DING).playerView;
    const command = commandOf(DING, "PLACE_GLAZE_LOAD", 1);
    if (command.type !== "PLACE_GLAZE_LOAD") throw new Error("type");
    const selection = probe(DING, draftFor(DING, command));
    expect(selection.kiln.length).toBeGreaterThan(0);
    expect(selection.pending.map((chip) => chip.ceramicId)).toEqual(command.loads.map((load) => load.ceramicId));
    expect(selection.highlighted).toEqual(command.loads.map((load) => load.ceramicId).sort());
    const model = buildGameModel(view, []);
    expect(workDraft.build(draftFor(DING, command) as never, model, engineViewOf(view))).toEqual(command);
  });

  it("work: a Commission Market draft makes the face-up display positions Order targets", () => {
    const command = commandOf(RICH, "PLACE_COMMISSION_MARKET");
    const selection = probe(RICH, draftFor(RICH, command));
    expect(selection.orders.length).toBeGreaterThan(0);
    expect(selection.orders.every(([key]) => key.startsWith("slot:"))).toBe(true);
    if (command.type === "PLACE_COMMISSION_MARKET" && command.first.kind === "face_up") {
      expect(Object.fromEntries(selection.orders)[`slot:${command.first.slotIndex}`]).toEqual({ state: "chosen", disabled: false });
    }
  });

  it("Setter's Mark: the open spaces are kiln targets; the chosen one is pressed", () => {
    const id = "m10a_setters_mark_window";
    const spaces = settersMarkOptions(fixture(id).playerView);
    expect(probe(id).kiln).toEqual(spaces.map((spaceId) => [spaceId, { pressed: false }]));
    const chosen = spaces[0];
    if (chosen === undefined) throw new Error("no space");
    expect(Object.fromEntries(probe(id, { choice: chosen }).kiln)[chosen]).toEqual({ pressed: true });
  });

  it("the private looks: the looked-at Orders are Order targets for their owner only", () => {
    for (const id of ["m2_commission_market_look_r3_4p", "m16_colour_samples"]) {
      const pending = fixture(id).playerView.own?.pendingLook ?? null;
      const look = pending !== null && "orderIds" in pending ? pending.orderIds : [];
      expect(look.length, id).toBeGreaterThan(0);
      expect(probe(id).orders.map(([key]) => key), id).toEqual(look);
    }
  });

  it("the whole game screen renders with a seeded work draft", () => {
    const draft = draftFor(DING, commandOf(DING, "PLACE_GLAZE_LOAD", 1));
    const html = renderComponent(fixtureSource(DING), <GameScreen />, { draft });
    expect(html).toContain('data-window="work"');
    expect(perceivable(html)).not.toMatch(INTERNAL_ID);
  });
});
