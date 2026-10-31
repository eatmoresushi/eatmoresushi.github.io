// @vitest-environment happy-dom
/**
 * Owner UI decision D21: free actions are never a step of their own, and a turn with nothing extra
 * costs one Confirm (OWNER_DECISIONS.md, D21; ENGINE_V1.6.2_DELTA §16.24). Owner: B6.
 *
 * - the chips and the pane's list come from the selectors, in D21's order, only in the viewer's own
 *   free-action windows;
 * - the split Confirm sends `endTurn: true` on the primary button and Enter, and no field on the
 *   secondary button and Shift+Enter, only where `endTurnOptions` lists the command;
 * - Enter on a radio chooses it, and with entries left it never ends the window (End turn and Done
 *   take their own press);
 * - a placement that opens a step has a plain Confirm: the choice sits on the last step;
 * - the Reserve variants and the private "You can deliver this now", from the viewer's own view only;
 * - the Order Phase's Deliver · done and Done;
 * - the commands the UI builds are accepted by the engine, and a plain turn costs one Confirm.
 */
import { act } from "react";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asActorView, endTurnOptions, guildInspectionOptions, placementOptions, validateAction } from "../../../../src/game/index.ts";
import type { AuthoritativeCommand, GameAction, PlayerView } from "../../../../src/game/index.ts";
import { DecisionPane } from "../../../../src/app/decision/DecisionPane.tsx";
import { deliverableNow, freeActionItems } from "../../../../src/app/decision/freeActions.ts";
import { WINDOWS } from "../../../../src/app/decision/windows.ts";
import { workDraft } from "../../../../src/app/decision/work/workDraft.ts";
import { I18nProvider } from "../../../../src/app/i18n/I18nProvider.tsx";
import { GameScreen } from "../../../../src/app/screens/GameScreen.tsx";
import { DraftStore } from "../../../../src/app/state/draftStore.ts";
import { windowDraftKey } from "../../../../src/app/state/decisionWindow.ts";
import { GameProvider } from "../../../../src/app/state/hooks.ts";
import { fixedLayoutSource } from "../../../../src/app/state/layoutMode.ts";
import type { LayoutMode } from "../../../../src/app/state/layoutMode.ts";
import { buildGameModel, engineViewOf } from "../../../../src/app/state/model.ts";
import { UiStore } from "../../../../src/app/state/uiStore.ts";
import { ControlledSource } from "../support/controlledSource.ts";
import { allFixtures, fixture, fixtureSource } from "../support/fixtures.ts";
import { renderComponent } from "../support/render.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CHIPS = "t-free-action-chips";
const PLACE = "t-place-split-confirm";
const AFTER = "t-after-action-free-actions";
const ORDER = "t-order-phase-free-actions";
const SWAP_AFTER = "t-swap-select-after-action";
const HINT = "t-reserve-deliver-hint";
const CROWN = "t-crown-order-deliver-hint";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

const engineOf = (id: string) => engineViewOf(fixture(id).playerView);
const modelOf = (id: string) => buildGameModel(fixture(id).playerView, []);

/** The fixture's draft command as the open window's stored draft (the gallery's own seed). */
function seeded(id: string): DraftStore {
  const drafts = new DraftStore();
  const entry = fixture(id);
  const command = entry.draftCommand;
  if (command === undefined) return drafts;
  const model = modelOf(id);
  const draft = WINDOWS[model.window.kind].draft.fromCommand(command, model, engineOf(id));
  if (draft === null) throw new Error(`${id}: its draft command does not express`);
  drafts.seed(windowDraftKey(model.window), draft);
  return drafts;
}

function mount(source: ControlledSource, id: string, element: ReactElement = <DecisionPane />, layoutMode: LayoutMode = "desktop", locale: "en" | "zh-CN" = "en"): void {
  const layout = fixedLayoutSource(layoutMode);
  act(() =>
    root.render(
      <I18nProvider defaultLocale={locale} strict>
        <GameProvider source={source} registry={WINDOWS} drafts={seeded(id)} ui={new UiStore({ layout })} layout={layout} devTools={false}>
          {element}
        </GameProvider>
      </I18nProvider>,
    ),
  );
}

const $ = <E extends HTMLElement = HTMLElement>(selector: string): E => {
  const found = container.querySelector<E>(selector);
  if (found === null) throw new Error(`no ${selector}`);
  return found;
};
const press = (target: HTMLElement) => act(() => target.click());
const primary = () => $<HTMLButtonElement>('[data-action="confirm"]');
const secondary = () => $<HTMLButtonElement>('[data-action="confirm-stay"]');
const enter = (target: HTMLElement, init: KeyboardEventInit = {}) =>
  act(() => {
    target.focus();
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ...init }));
  });
const accepted = (id: string, command: AuthoritativeCommand) => {
  const actor = asActorView(fixture(id).playerView);
  if (actor === null) throw new Error("the viewer does not act");
  return validateAction(actor, command as GameAction);
};

describe("the chips and the list come from the selectors (D21)", () => {
  it("before placing: Deliver per completable held Order, Sell, Imperial Priority, the swap, in that order", () => {
    const html = renderComponent(fixtureSource(CHIPS), <GameScreen />);
    expect([...html.matchAll(/data-pane-opener="([^"]+)"[^>]*>([^<]+)</g)].map((match) => [match[1], match[2]])).toEqual([
      ["complete-S05", "Deliver S05"],
      ["sell_flawed", "Sell Flawed (+2 Coins)"],
      ["imperial_priority", "Imperial Priority"],
      ["colour_samples_swap", "Colour Samples swap"],
    ]);
    const zh = renderComponent(fixtureSource(CHIPS), <GameScreen />, { locale: "zh-CN" });
    expect([...zh.matchAll(/data-pane-opener="[^"]+"[^>]*>([^<]+)</g)].map((match) => match[1])).toEqual(["交付S05", "卖出瑕品（+2铜钱）", "御烧优先", "色样簿换单"]);
    expect(html).toMatch(/class="pane-openers-label">Free actions</);
    expect(zh).toMatch(/class="pane-openers-label">自由行动</);
  });

  it("the same actions sit on the pieces: a Deliver badge, Sell 2, Use", () => {
    const html = renderComponent(fixtureSource(CHIPS), <GameScreen />);
    // S05 can be delivered; S03 cannot, and shows no Deliver badge.
    expect(html).toMatch(/data-order-id="S05"[\s\S]*?aria-label="Deliver: Order S05"/);
    expect(html).not.toContain('aria-label="Deliver: Order S03"');
    expect(html).toMatch(/data-act="sell"[^>]*>Sell 2</);
    expect(html).toMatch(/data-act="imperial-priority"[^>]*>Use</);
    const zh = renderComponent(fixtureSource(CHIPS), <GameScreen />, { locale: "zh-CN" });
    expect(zh).toMatch(/data-act="sell"[^>]*>卖出2</);
    expect(zh).toMatch(/data-act="imperial-priority"[^>]*>使用</);
  });

  it("the list is the free-action list of the viewer's window; the swap never in the Order Phase (R28)", () => {
    expect(freeActionItems(engineOf(AFTER)).map((item) => item.key)).toEqual(["complete-S05", "sell_flawed", "imperial_priority", "colour_samples_swap"]);
    expect(freeActionItems(engineOf(ORDER)).map((item) => item.key)).toEqual(["complete-S05", "sell_flawed", "imperial_priority"]);
  });

  it("another player's board shows their token but no Use, and no chips show on their turn or during the firing", () => {
    const view = structuredClone(fixture(CHIPS).playerView) as PlayerView;
    const phase = view.game.phase;
    if (phase.type !== "work_turn") throw new Error("fixture");
    phase.activePlayerId = "p2";
    expect(freeActionItems(engineViewOf(view))).toEqual([]);
    const source = new ControlledSource(CHIPS);
    act(() => source.setView(view));
    mount(source, CHIPS, <GameScreen />);
    expect(container.querySelector("[data-pane-opener]")).toBeNull();
    expect(container.querySelector('[data-act="imperial-priority"]')).toBeNull();
    expect(container.querySelector('[data-act="sell"]')).toBeNull();
    expect(container.querySelector("[data-imperial-priority]")?.textContent).toContain("Imperial Priority token");
    for (const id of ["m4_after_quality_3p", "m9_contributions_step1_3p", "m7_cleanup_hand_limit_3p"]) {
      expect(renderComponent(fixtureSource(id), <GameScreen />), id).not.toContain("data-pane-opener");
    }
  });
});

describe("the split Confirm on a placement", () => {
  it("Place · end turn sends endTurn: true (the default), Place, then free actions omits it; both are visible and take the keys", () => {
    const source = new ControlledSource(PLACE);
    mount(source, PLACE);
    expect(primary().textContent).toBe("Place · end turn");
    expect(secondary().textContent).toBe("Place, then free actions");
    expect(primary().getAttribute("type")).toBe("submit");
    expect(primary().getAttribute("aria-keyshortcuts")).toBe("Enter");
    expect(secondary().getAttribute("aria-keyshortcuts")).toBe("Shift+Enter");
    expect(secondary().closest("[hidden], details")).toBeNull();
    press(secondary());
    const stay = source.submitted.at(-1) as Extract<AuthoritativeCommand, { type: "PLACE_CANAL_WHARF" }>;
    expect(stay.type).toBe("PLACE_CANAL_WHARF");
    expect(stay).not.toHaveProperty("endTurn");
    expect(accepted(PLACE, stay)).toBeNull();
  });

  it("the primary button's command is accepted by the engine", () => {
    const source = new ControlledSource(PLACE);
    mount(source, PLACE);
    press(primary());
    const end = source.submitted.at(-1) as AuthoritativeCommand & { endTurn?: boolean };
    expect(end.endTurn).toBe(true);
    expect(accepted(PLACE, end)).toBeNull();
    expect(source.submitted).toHaveLength(1);
  });

  it("Chinese labels, verbatim", () => {
    mount(new ControlledSource(PLACE), PLACE, <DecisionPane />, "desktop", "zh-CN");
    expect(primary().textContent).toBe("派工并结束回合");
    expect(secondary().textContent).toBe("派工后做自由行动");
  });

  it("Enter on the pane's heading is the default, Shift+Enter the secondary; a held key and an IME's Enter never confirm", () => {
    const source = new ControlledSource(PLACE);
    mount(source, PLACE);
    const heading = $(".pane-heading");
    enter(heading, { repeat: true });
    enter(heading, { isComposing: true });
    expect(source.submitted).toHaveLength(0);
    enter(heading, { shiftKey: true });
    expect(source.submitted).toHaveLength(1);
    expect(source.submitted.at(-1)).not.toHaveProperty("endTurn");
  });

  it("Enter on the heading sends the default choice", () => {
    const source = new ControlledSource(PLACE);
    mount(source, PLACE);
    enter($(".pane-heading"));
    expect(source.submitted.at(-1)).toMatchObject({ type: "PLACE_CANAL_WHARF", endTurn: true });
  });

  it("Shift+Enter on the focused primary button is still the secondary; a button keeps its own Enter", () => {
    const source = new ControlledSource(PLACE);
    mount(source, PLACE);
    enter(primary(), { shiftKey: true });
    expect(source.submitted.at(-1)).not.toHaveProperty("endTurn");
    const other = new ControlledSource(PLACE);
    act(() => root.unmount());
    root = createRoot(container);
    mount(other, PLACE);
    const clear = [...container.querySelectorAll<HTMLButtonElement>(".confirm-buttons button")].find((button) => button.textContent === "Clear");
    if (clear === undefined) throw new Error("no Clear");
    enter(clear);
    expect(other.submitted).toHaveLength(0);
  });

  it("a plain turn costs one Confirm: Place on the table, then Enter, and the one command ends the turn", () => {
    const source = new ControlledSource(CHIPS);
    mount(source, CHIPS, <GameScreen />);
    const place = $<HTMLButtonElement>('[data-act="place"][data-location-id="canal_wharf"][data-worker="apprentice"]');
    press(place);
    expect(source.submitted).toHaveLength(0);
    enter($(".pane-heading"));
    expect(source.submitted).toHaveLength(1);
    expect(source.submitted[0]).toMatchObject({ type: "PLACE_CANAL_WHARF", endTurn: true });
    expect(accepted(CHIPS, source.submitted[0] as AuthoritativeCommand)).toBeNull();
  });

  it("sends the field only where endTurnOptions lists the command: before placing a free action's Confirm is plain", () => {
    expect(endTurnOptions(fixture(CHIPS).playerView)?.commandTypes).not.toContain("COMPLETE_ORDER");
    const source = new ControlledSource(CHIPS);
    mount(source, CHIPS, <GameScreen />);
    press($('[data-pane-opener="complete-S05"]'));
    expect(primary().textContent).toBe("Confirm");
    expect(container.querySelector('[data-action="confirm-stay"]')).toBeNull();
    press(primary());
    expect(source.submitted.at(-1)).toEqual({ type: "COMPLETE_ORDER", orderId: "S05", ceramicIds: ["c1"] });
  });

  it("the second button is left out only where the action cannot open the after-action step, decided from public facts", () => {
    const location = (id: string, locationId: string, workerKey: string) => {
      const model = modelOf(id);
      const engine = engineOf(id);
      const placed = workDraft.reduce(workDraft.initial(model, engine), { type: "place", locationId: locationId as never, workerKey }, model, engine);
      return WINDOWS.work.confirmSplit?.(placed as never, model, engine);
    };
    const nothing = "m1_work_phase_r2_3p";
    expect(endTurnOptions(fixture(nothing).playerView)?.afterActionWouldOpen).toBe(false);
    // The Apprentice's Canal Wharf and Materials Yard change none of those facts.
    expect(location(nothing, "canal_wharf", "apprentice")?.stay).toBeNull();
    const yard = allFixtures().find((entry) => {
      const view = entry.playerView;
      return endTurnOptions(view)?.stage === "before_action" && endTurnOptions(view)?.afterActionWouldOpen === false && location(entry.id, "materials_yard", "apprentice") != null;
    });
    if (yard === undefined) throw new Error("no fixture with an open Materials Yard and nothing after it");
    expect(location(yard.id, "materials_yard", "apprentice")?.stay).toBeNull();
    // With the step open on public facts, every placement has both.
    expect(endTurnOptions(fixture(CHIPS).playerView)?.afterActionWouldOpen).toBe(true);
    expect(location(CHIPS, "materials_yard", "apprentice")?.stay).not.toBeNull();
    // The decision never reads a hand: the same public facts with another hand give the same buttons.
    const view = structuredClone(fixture(nothing).playerView);
    if (view.own === null) throw new Error("fixture");
    view.own.orderHand = [...view.own.orderHand].reverse();
    expect(endTurnOptions(view)?.afterActionWouldOpen).toBe(false);
  });

  it("a placement that opens a step has a plain Confirm and no field: the choice sits on the last step", () => {
    const source = new ControlledSource(CHIPS);
    mount(source, CHIPS, <GameScreen />);
    press($('[data-act="place"][data-location-id="commission_market"][data-worker="apprentice"]'));
    expect(primary().textContent).toBe("Confirm");
    expect(container.querySelector('[data-action="confirm-stay"]')).toBeNull();
    press(primary());
    expect(source.submitted.at(-1)).toMatchObject({ type: "PLACE_COMMISSION_MARKET" });
    expect(source.submitted.at(-1)).not.toHaveProperty("endTurn");
  });

  it("the Guild Hall: the Shifu's inspection and the Apprentice's Colour Samples have a plain Confirm, another Tech the split", () => {
    const model = modelOf(CHIPS);
    const engine = engineOf(CHIPS);
    const split = (workerKey: string, techId: string | null, discipline: string | null) => {
      const placed = workDraft.reduce(workDraft.initial(model, engine), { type: "place", locationId: "guild_hall", workerKey }, model, engine);
      const chosen = techId !== null ? { ...placed, perLocation: { ...placed.perLocation, guild_hall: { techId, discipline: null } } } : { ...placed, perLocation: { ...placed.perLocation, guild_hall: { techId: null, discipline } } };
      return WINDOWS.work.confirmSplit?.(chosen as never, model, engine) ?? null;
    };
    expect(split("shifu", null, "firing")).toBeNull();
    expect(split("apprentice", "T10", null)).toBeNull();
    expect(split("apprentice", "T24", null)).not.toBeNull();
  });
});

describe("the second button says what the next screen does (R27, afterActionMayOpen)", () => {
  /** A clone of the chips' moment: the viewer's ceramics gone, no Tech, nothing that opens the step. */
  const bare = (edit: (view: PlayerView, me: PlayerView["game"]["players"][string]) => void = () => undefined) => {
    const view = structuredClone(fixture(CHIPS).playerView) as PlayerView;
    const viewerId = view.viewerId as string;
    for (const [id, ceramic] of Object.entries(view.game.ceramics)) if (ceramic.ownerId === viewerId) delete view.game.ceramics[id as never];
    const me = view.game.players[viewerId]!;
    me.techs = [];
    me.imperial.priority = "on_track";
    me.imperial.kilnGained = false;
    me.imperial.recognition = 0;
    me.resources = { clay: 5, wood: 5, coins: 9 };
    edit(view, me);
    return view;
  };
  const splitOf = (view: PlayerView, locationId: string, workerKey: string, sub?: Record<string, unknown>) => {
    const model = buildGameModel(view, []);
    const engine = engineViewOf(view);
    let draft = workDraft.reduce(workDraft.initial(model, engine), { type: "place", locationId: locationId as never, workerKey }, model, engine);
    if (sub !== undefined) draft = { ...draft, perLocation: { ...draft.perLocation, [locationId]: { ...draft.perLocation[locationId as "materials_yard"], ...sub } } };
    return WINDOWS.work.confirmSplit?.(draft as never, model, engine) ?? null;
  };
  const held = (view: PlayerView) => {
    const me = view.game.players[view.viewerId as string]!;
    me.imperial.priority = "held";
    me.imperial.kilnGained = true;
    me.imperial.recognition = 3;
  };

  it("Prepared Clay at the Materials Yard brings a Shaped vessel: with Imperial Priority held, the second button shows", () => {
    const view = bare((whole, me) => {
      held(whole);
      me.techs = [{ id: "T17", usedThisRound: false } as never];
    });
    expect(endTurnOptions(view)?.afterActionWouldOpen).toBe(false);
    expect(splitOf(view, "materials_yard", "apprentice")?.stay).toBeNull();
    expect(splitOf(view, "materials_yard", "apprentice", { clay: 2, preparedClay: { shape: "bowl", decoration: "plain" } })?.stay).toMatchObject({ key: "common.confirm.placeStay" });
  });

  it("Form & Decorate: only with the other half of Imperial Priority", () => {
    expect(splitOf(bare(), "form_decorate", "apprentice")?.stay).toBeNull();
    expect(splitOf(bare((view) => held(view)), "form_decorate", "apprentice")?.stay).toMatchObject({ key: "common.confirm.placeStay" });
  });

  it("an Order into the hand: only with a Finished ceramic to deliver it with, from public facts", () => {
    const shifuWharf = (view: PlayerView) => splitOf(view, "canal_wharf", "shifu")?.stay ?? null;
    expect(shifuWharf(bare())).toBeNull();
    const withCeramic = structuredClone(fixture(CHIPS).playerView) as PlayerView;
    const viewerId = withCeramic.viewerId as string;
    const finished = Object.entries(withCeramic.game.ceramics).find(([, ceramic]) => ceramic.ownerId === viewerId && ceramic.stage === "finished" && ceramic.quality !== "flawed");
    if (finished === undefined) throw new Error("fixture");
    const view = bare((whole) => {
      whole.game.ceramics[finished[0] as never] = finished[1];
      whole.game.counts.orderHands[viewerId] = 0;
      if (whole.own !== null) whole.own.orderHand = [];
    });
    expect(endTurnOptions(view)?.afterActionWouldOpen).toBe(false);
    expect(shifuWharf(view)).toMatchObject({ key: "common.confirm.placeStay" });
  });

  it("the Magistrate's Hall: reaching Imperial Priority with a Shaped vessel, or a Crown Order with a Finished ceramic", () => {
    const view = bare();
    expect(splitOf(view, "magistrates_hall", "apprentice")?.stay).toBeNull();
    const formed = structuredClone(fixture(CHIPS).playerView) as PlayerView;
    const viewerId = formed.viewerId as string;
    const shaped = Object.entries(formed.game.ceramics).find(([, ceramic]) => ceramic.ownerId === viewerId && ceramic.stage === "shaped");
    if (shaped === undefined) throw new Error("fixture");
    const at2 = bare((whole, me) => {
      me.imperial.recognition = 2;
      me.imperial.kilnGained = true;
      whole.game.ceramics[shaped[0] as never] = shaped[1];
    });
    expect(endTurnOptions(at2)?.afterActionWouldOpen).toBe(false);
    expect(splitOf(at2, "magistrates_hall", "apprentice")?.stay).toMatchObject({ key: "common.confirm.placeStay" });
  });

  it("the Select: Round 1 has no second button, and a Finished ceramic brings it back before the Order lands", () => {
    const id = "w-commission-market-apprentice-top-2-look-1-reservation";
    expect(endTurnOptions(fixture(id).playerView)?.afterActionWouldOpen).toBe(false);
    expect(WINDOWS.commission.confirmSplit?.({ picks: [] } as never, modelOf(id), engineOf(id))).toMatchObject({ stay: null });
    // The hint's moment: a Finished ceramic and no held Order: the step is false now and opens after.
    expect(endTurnOptions(fixture(HINT).playerView)?.afterActionWouldOpen).toBe(false);
    expect(WINDOWS.commission.confirmSplit?.({ picks: [] } as never, modelOf(HINT), engineOf(HINT))?.stay).toMatchObject({ key: "common.confirm.reserveStay" });
  });

  it("with no second button Shift+Enter sends no field: it never asks for more than the player pressed", () => {
    const source = new ControlledSource("m1_work_phase_r2_3p");
    mount(source, "m1_work_phase_r2_3p", <GameScreen />);
    press($('[data-act="place"][data-location-id="canal_wharf"][data-worker="apprentice"]'));
    expect(container.querySelector('[data-action="confirm-stay"]')).toBeNull();
    expect(container.querySelector(".confirm-keys")).toBeNull();
    enter($(".pane-heading"), { shiftKey: true });
    expect(source.submitted.at(-1)).toMatchObject({ type: "PLACE_CANAL_WHARF" });
    expect(source.submitted.at(-1)).not.toHaveProperty("endTurn");
  });

  it("says the keys to whoever has a keyboard, hidden from a screen reader (which has aria-keyshortcuts)", () => {
    mount(new ControlledSource(PLACE), PLACE);
    expect($(".confirm-keys").textContent).toBe("Enter presses the first button, Shift+Enter the second.");
    expect($(".confirm-keys").getAttribute("aria-hidden")).toBe("true");
    act(() => root.unmount());
    root = createRoot(container);
    mount(new ControlledSource(PLACE), PLACE, <DecisionPane />, "desktop", "zh-CN");
    expect($(".confirm-keys").textContent).toBe("回车键按第一个按钮，Shift+回车键按第二个。");
  });
});

describe("· end turn is only ever on the action's last step (D21)", () => {
  const INSPECTION = "m12_guild_shifu_inspection";
  /** The inspection with the viewer's Coins set: enough for another Tech, or only for this one. */
  const inspection = (coins: number, edit: (view: PlayerView) => void = () => undefined) => {
    const view = structuredClone(fixture(INSPECTION).playerView) as PlayerView;
    view.game.players[view.viewerId as string]!.resources.coins = coins;
    edit(view);
    return view;
  };
  const takeSplit = (view: PlayerView, take: { kind: "inspected" | "face_up"; techId: string }) =>
    WINDOWS.guild_inspection.confirmSplit?.({ choice: { kind: "take", take }, bottomOrder: [] } as never, buildGameModel(view, []), engineViewOf(view)) ?? null;

  it("a take that leaves another Tech possible, or 2 inspected Techs to return, is a plain Confirm", () => {
    const rich = inspection(30);
    const options = guildInspectionOptions(rich);
    if (options === null) throw new Error("fixture");
    const inspected = options.inspected[0]!;
    const faceUp = options.faceUp.find((option) => option.discipline !== options.discipline)!;
    // Coins for a second Tech: the window reopens.
    expect(takeSplit(rich, { kind: "inspected", techId: inspected.techId })).toBeNull();
    // Both inspected Techs left: their bottom order follows, whatever the Coins.
    expect(takeSplit(inspection(faceUp.cost), { kind: "face_up", techId: faceUp.techId })).toBeNull();
  });

  it("a take after which the engine closes the step has the split: no Coins for another Tech", () => {
    const options = guildInspectionOptions(fixture(INSPECTION).playerView);
    if (options === null) throw new Error("fixture");
    const inspected = options.inspected.find((option) => option.techId !== "T10")!;
    const view = inspection(inspected.cost);
    const split = takeSplit(view, { kind: "inspected", techId: inspected.techId });
    expect(split?.end).toMatchObject({ key: "common.confirm.takeEnd" });
    // The engine agrees: `split_agrees_with_engine.test.ts` plays this against random games.
  });

  it("Colour Samples opens its Select, so its take is plain; a Select with an inspection behind it too, until nothing follows", () => {
    const id = "m16_colour_samples";
    const select = (edit: (view: PlayerView, step: { resume: unknown }) => void) => {
      const view = structuredClone(fixture(id).playerView) as PlayerView;
      const phase = view.game.phase;
      if (phase.type !== "work_turn" || phase.step.kind !== "colour_samples") throw new Error("fixture");
      edit(view, phase.step as never);
      return WINDOWS.colour_samples.confirmSplit?.({ picks: [] } as never, buildGameModel(view, []), engineViewOf(view)) ?? null;
    };
    // After an Apprentice's buy: the last step.
    expect(select(() => undefined)?.end).toMatchObject({ key: "common.confirm.reserveEnd" });
    // Inside the Shifu's inspection with 2 inspected Techs untaken: their bottom order follows.
    const resume = (takes: unknown[], inspectedCount: number) => ({ kind: "guild_inspection", workerId: "x", discipline: "glaze_load", inspectedCount, takes });
    expect(select((_view, step) => (step.resume = resume([{ kind: "face_up", techId: "T10" }], 2)))).toBeNull();
    // Both takes made and nothing to return: this Select is the last step.
    expect(
      select((_view, step) => (step.resume = resume([{ kind: "face_up", techId: "T10" }, { kind: "face_up", techId: "T05" }], 0)))?.end,
    ).toMatchObject({ key: "common.confirm.reserveEnd" });
  });
});

describe("nothing irreversible is chosen or given up by a stray Enter (D21)", () => {
  it("one entry in the Order Phase: it waits for a press, and Enter on the heading never gives up the window", () => {
    const id = "w-order-phase-sell-a-flawed-ceramic";
    const source = new ControlledSource(id);
    mount(source, id);
    expect($<HTMLInputElement>('input[name="freeAction"][value="sell_flawed"]').checked).toBe(false);
    expect(container.querySelector('[data-action="confirm"]')).toBeNull();
    const done = $('[data-action="alt"]');
    expect(done.textContent).toBe("Done");
    expect(done.className).toContain("kit-btn--primary");
    expect(done.getAttribute("aria-keyshortcuts")).toBeNull();
    enter($(".pane-heading"));
    enter($(".pane-heading"), { shiftKey: true });
    expect(source.submitted).toEqual([]);
  });

  it("Done ends the Order turn with its own press, by Enter on the button or a click", () => {
    const id = "w-order-phase-sell-a-flawed-ceramic";
    const source = new ControlledSource(id);
    mount(source, id);
    // A button keeps its own Enter: the handler leaves it to the browser, which clicks it.
    enter($('[data-action="alt"]'));
    expect(source.submitted).toEqual([]);
    press($('[data-action="alt"]'));
    expect(source.submitted).toEqual([{ type: "END_ORDER_TURN" }]);
  });

  it("Enter on a radio chooses that entry, sends nothing; the next Enter is the labelled default", () => {
    const id = "w-order-phase-sell-a-flawed-ceramic";
    const source = new ControlledSource(id);
    mount(source, id);
    const radio = () => $<HTMLInputElement>('input[name="freeAction"][value="sell_flawed"]');
    enter(radio());
    expect(source.submitted).toEqual([]);
    expect(radio().checked).toBe(true);
    expect(primary().textContent).toBe("Sell · done");
    // A held key is not a second press.
    enter(radio(), { repeat: true });
    expect(source.submitted).toEqual([]);
    enter(radio());
    expect(source.submitted).toEqual([{ type: "SELL_FLAWED", ceramicId: expect.any(String), endTurn: true }]);
  });

  it("Shift+Enter on an unchosen radio chooses it too, and never sends the entry chosen before", () => {
    const id = "w-after-the-worker-action";
    const source = new ControlledSource(id);
    mount(source, id);
    const radios = () => Array.from(container.querySelectorAll<HTMLInputElement>('input[name="freeAction"]'));
    expect(radios().length).toBeGreaterThan(1);
    press(radios()[0]!);
    const chosen = radios()[0]!.value;
    const other = radios().find((radio) => !radio.checked)!;
    enter(other, { shiftKey: true });
    expect(source.submitted).toEqual([]);
    expect(radios().find((radio) => radio.checked)?.value).not.toBe(chosen);
  });

  it("the entry pressed: Sell · done, its only ceramic chosen, one press more", () => {
    const id = "w-order-phase-sell-a-flawed-ceramic";
    const source = new ControlledSource(id);
    mount(source, id);
    press($('input[name="freeAction"][value="sell_flawed"]'));
    expect(primary().textContent).toBe("Sell · done");
    enter($(".pane-heading"));
    expect(source.submitted.at(-1)).toMatchObject({ type: "SELL_FLAWED", endTurn: true });
  });

  it("after the worker action, with entries: neither the heading nor a radio ends the turn", () => {
    const id = "w-after-the-worker-action";
    const source = new ControlledSource(id);
    mount(source, id);
    const end = $('[data-action="alt"]');
    expect(end.textContent).toBe("End turn");
    expect(end.getAttribute("aria-keyshortcuts")).toBeNull();
    enter($(".pane-heading"));
    enter($(".pane-heading"), { shiftKey: true });
    expect(source.submitted).toEqual([]);
    enter($('input[name="freeAction"]'));
    expect(source.submitted).toEqual([]);
    expect($<HTMLInputElement>('input[name="freeAction"]').checked).toBe(true);
  });

  it("after the worker action, with nothing to choose: Enter presses End turn, which gives nothing up", () => {
    const id = "m17_after_action";
    const view = structuredClone(fixture(id).playerView) as PlayerView;
    const me = view.game.players[view.viewerId as string]!;
    me.techs = me.techs.map((tech) => (tech.id === "T10" ? { ...tech, usedThisRound: true } : tech));
    const source = new ControlledSource(id);
    source.setView(view);
    mount(source, id);
    expect(container.querySelector('input[name="freeAction"]')).toBeNull();
    expect($('[data-action="alt"]').getAttribute("aria-keyshortcuts")).toBe("Enter");
    enter($(".pane-heading"), { shiftKey: true });
    expect(source.submitted).toEqual([]);
    enter($(".pane-heading"));
    expect(source.submitted).toEqual([{ type: "END_TURN" }]);
  });

  it("the only legal placement opens by itself only when nothing could come first (the chips stay up otherwise)", () => {
    // Late in a round: one Apprentice left, the capped spaces full, no Coins: only the Canal Wharf.
    const lastWorker = (edit: (view: PlayerView) => void = () => undefined) => {
      const view = structuredClone(fixture(CHIPS).playerView) as PlayerView;
      const viewerId = view.viewerId as string;
      const me = view.game.players[viewerId]!;
      const other = Object.values(view.game.players).find((player) => player.id !== viewerId)!;
      const mine = Object.values(me.workers);
      const free = mine.find((worker) => worker.kind === "apprentice")!;
      let index = 0;
      for (const worker of mine) {
        if (worker !== free) worker.placement = { locationId: index < 1 ? "form_decorate" : "glaze_load", spaceIndex: index === 2 ? 1 : 0 } as never;
        index += 1;
      }
      const spots = [["materials_yard", 0], ["materials_yard", 1], ["commission_market", 0], ["commission_market", 1]] as const;
      const theirs = Object.values(other.workers);
      spots.forEach(([locationId, spaceIndex], i) => {
        const worker = theirs[i];
        if (worker !== undefined) worker.placement = { locationId, spaceIndex } as never;
      });
      me.resources = { clay: 0, wood: 0, coins: 0 };
      edit(view);
      return view;
    };
    const view = lastWorker();
    expect(placementOptions(view).filter((placement) => placement.legal).map((placement) => placement.locationId)).toEqual(["canal_wharf"]);
    const model = buildGameModel(view, []);
    const engine = engineViewOf(view);
    expect(freeActionItems(engine).length).toBeGreaterThan(0);
    const draft = workDraft.initial(model, engine);
    expect(draft.mode).toBe("place");
    expect(draft.locationId).toBeNull();
    const pane = WINDOWS.work.pane?.(draft, model, engine);
    expect(pane?.hidden).toBe(true);
    expect(pane?.hidden === true ? pane.openers.map((opener) => opener.key) : []).toEqual(freeActionItems(engine).map((item) => item.key));
    // Nothing could come first: the only placement left opens by itself, one Confirm away.
    const plain = lastWorker((whole) => {
      const viewerId = whole.viewerId as string;
      for (const [id, ceramic] of Object.entries(whole.game.ceramics)) if (ceramic.ownerId === viewerId) delete whole.game.ceramics[id as never];
      const me = whole.game.players[viewerId]!;
      me.techs = [];
      me.imperial.priority = "on_track";
    });
    const plainModel = buildGameModel(plain, []);
    const plainEngine = engineViewOf(plain);
    expect(freeActionItems(plainEngine)).toEqual([]);
    expect(workDraft.initial(plainModel, plainEngine).locationId).toBe("canal_wharf");
  });
});

describe("the Reserve variants and the private hint", () => {
  it("the Commission Market's Select: Reserve · end turn / Reserve, then free actions, in both languages", () => {
    const source = new ControlledSource(HINT);
    mount(source, HINT);
    expect(primary().textContent).toBe("Reserve · end turn");
    expect(secondary().textContent).toBe("Reserve, then free actions");
    press(primary());
    expect(source.submitted.at(-1)).toMatchObject({ type: "SELECT_CHOOSE", endTurn: true });
    expect(accepted(HINT, source.submitted.at(-1) as AuthoritativeCommand)).toBeNull();
    act(() => root.unmount());
    root = createRoot(container);
    mount(new ControlledSource(HINT), HINT, <DecisionPane />, "desktop", "zh-CN");
    expect(primary().textContent).toBe("承接并结束回合");
    expect(secondary().textContent).toBe("承接后做自由行动");
    expect($("[data-confirm-hint]").textContent).toBe("现在就能交付");
  });

  it("the secondary sends SELECT_CHOOSE without the field", () => {
    const source = new ControlledSource(HINT);
    mount(source, HINT);
    press(secondary());
    expect(source.submitted.at(-1)).toMatchObject({ type: "SELECT_CHOOSE" });
    expect(source.submitted.at(-1)).not.toHaveProperty("endTurn");
  });

  it("You can deliver this now: only for an Order the viewer's own Finished ceramics match, named by the buttons' description", () => {
    mount(new ControlledSource(HINT), HINT);
    const hint = $("[data-confirm-hint]");
    expect(hint.textContent).toBe("You can deliver this now");
    expect(primary().getAttribute("aria-describedby")).toContain(hint.id);
    // A display Order they cannot complete: no hint.
    const engine = engineOf(HINT);
    const display = engine.view.game.market.display;
    const other = display.find((orderId) => orderId !== null && !deliverableNow(engine, orderId));
    if (other == null) throw new Error("fixture: every Order matches");
    const slotIndex = display.indexOf(other);
    const model = modelOf(HINT);
    const draft = { picks: [`slot:${slotIndex}`] };
    expect(WINDOWS.commission.confirmHint?.(draft as never, model, engine)).toBeNull();
  });

  it("nothing about it reaches anyone else: it reads the viewer's own view and is never in the table or the log", () => {
    const html = renderComponent(fixtureSource(HINT), <GameScreen />, { drafts: seeded(HINT) } as never);
    expect((html.match(/You can deliver this now/g) ?? []).length).toBeLessThanOrEqual(1);
    // Another seat's copy of the same moment: not their Select, and no hint at all.
    const view = structuredClone(fixture(HINT).playerView);
    const otherView: PlayerView = { ...view, viewerId: "p2", own: null };
    expect(deliverableNow(engineViewOf(otherView), "O01")).toBe(false);
    // The viewer's matcher reads only their own Finished ceramics: without them it finds nothing.
    const stripped = structuredClone(fixture(HINT).playerView);
    for (const [ceramicId, ceramic] of Object.entries(stripped.game.ceramics)) if (ceramic.ownerId === stripped.viewerId) delete stripped.game.ceramics[ceramicId];
    const first = stripped.game.market.display[0];
    if (first == null) throw new Error("fixture");
    expect(deliverableNow(engineViewOf(stripped), first)).toBe(false);
    expect(deliverableNow(engineOf(HINT), first)).toBe(true);
  });

  it("the Magistrate's Hall Shifu's Crown Order: the Reserve buttons on the placement itself, with the hint; without one, Place", () => {
    const source = new ControlledSource(CROWN);
    mount(source, CROWN);
    expect(primary().textContent).toBe("Reserve · end turn");
    expect(secondary().textContent).toBe("Reserve, then free actions");
    expect($("[data-confirm-hint]").textContent).toBe("You can deliver this now");
    press(primary());
    const sent = source.submitted.at(-1) as Extract<AuthoritativeCommand, { type: "PLACE_MAGISTRATES_HALL" }> & { endTurn?: boolean };
    expect(sent.crownOrder).toBeDefined();
    expect(sent.endTurn).toBe(true);
    expect(accepted(CROWN, sent)).toBeNull();
    const model = modelOf(CROWN);
    const engine = engineOf(CROWN);
    const placed = workDraft.reduce(workDraft.initial(model, engine), { type: "place", locationId: "magistrates_hall", workerKey: "shifu" }, model, engine);
    expect(WINDOWS.work.confirmSplit?.(placed as never, model, engine)?.end).toMatchObject({ key: "common.confirm.placeEnd" });
    expect(WINDOWS.work.confirmHint?.(placed as never, model, engine)).toBeNull();
  });

  it("a Colour Samples Select when acquired: the Reserve buttons", () => {
    const source = new ControlledSource("m16_colour_samples");
    mount(source, "m16_colour_samples");
    expect(primary().textContent).toBe("Reserve · end turn");
    expect(secondary().textContent).toBe("Reserve, then free actions");
  });

  it("the swap's Select: after the worker action Reserve · end turn / Reserve; before it a plain Confirm (the placement is still due)", () => {
    const after = new ControlledSource(SWAP_AFTER);
    mount(after, SWAP_AFTER);
    expect(primary().textContent).toBe("Reserve · end turn");
    expect(secondary().textContent).toBe("Reserve");
    act(() => root.unmount());
    root = createRoot(container);
    const before = "m20_colour_samples_swap_look";
    expect(endTurnOptions(fixture(before).playerView)?.commandTypes).not.toContain("SELECT_CHOOSE");
    mount(new ControlledSource(before), before);
    expect(primary().textContent).toBe("Confirm");
    expect(container.querySelector('[data-action="confirm-stay"]')).toBeNull();
  });

  it("the Guild Hall inspection: a take that leaves 2 inspected Techs has a plain Confirm; stopping has the split", () => {
    const id = "m21_guild_shifu_second_take";
    const model = modelOf(id);
    const engine = engineOf(id);
    const finish = WINDOWS.guild_inspection.confirmSplit?.({ choice: { kind: "finish" }, bottomOrder: [] } as never, model, engine);
    expect(finish?.end).toMatchObject({ key: "common.confirm.finishEnd" });
    expect(finish?.stay).toMatchObject({ key: "common.confirm.finishStay" });
    expect(WINDOWS.guild_inspection.confirmSplit?.({ choice: null, bottomOrder: [] } as never, model, engine)).toBeNull();
    // A first take of a face-up Tech leaves both inspected Techs: their bottom order is a step of its own.
    const first = "m12_guild_shifu_inspection";
    const opening = engineOf(first);
    const faceUp = opening.view.game.techDisplay;
    const techId = Object.values(faceUp).flat()[0];
    expect(WINDOWS.guild_inspection.confirmSplit?.({ choice: { kind: "take", take: { kind: "face_up", techId } }, bottomOrder: [] } as never, modelOf(first), opening)).toBeNull();
  });

  it("a request made earlier in the action is withdrawn by the secondary with endTurn: false", () => {
    const view = structuredClone(fixture(HINT).playerView);
    const phase = view.game.phase;
    if (phase.type !== "work_turn") throw new Error("fixture");
    phase.endTurnAfterAction = true;
    const source = new ControlledSource(HINT);
    act(() => source.setView(view));
    mount(source, HINT);
    press(secondary());
    expect(source.submitted.at(-1)).toMatchObject({ type: "SELECT_CHOOSE", endTurn: false });
  });
});

describe("after the worker action: ⟨Action⟩ · end turn beside ⟨Action⟩, and End turn stays", () => {
  it("the list, with each free action's two buttons", () => {
    const source = new ControlledSource(AFTER);
    mount(source, AFTER);
    expect([...container.querySelectorAll<HTMLInputElement>('input[name="freeAction"]')].map((input) => input.value)).toEqual(["complete-S05", "sell_flawed", "imperial_priority", "colour_samples_swap"]);
    expect(primary().textContent).toBe("Deliver · end turn");
    expect(secondary().textContent).toBe("Deliver");
    expect($('[data-action="alt"]').textContent).toBe("End turn");
    press($('input[name="freeAction"][value="sell_flawed"]'));
    expect(primary().textContent).toBe("Sell · end turn");
    expect(secondary().textContent).toBe("Sell");
    press($('input[name="freeAction"][value="imperial_priority"]'));
    expect(primary().textContent).toBe("Imperial Priority · end turn");
    expect(secondary().textContent).toBe("Imperial Priority");
    // The swap's first Confirm only opens its Select: plain, the field refused (DELTA §16.24).
    press($('input[name="freeAction"][value="colour_samples_swap"]'));
    expect(primary().textContent).toBe("Confirm");
    expect(container.querySelector('[data-action="confirm-stay"]')).toBeNull();
    expect($('[data-action="alt"]').textContent).toBe("End turn");
  });

  it("Deliver · end turn is one command, accepted; Deliver leaves the turn open; End turn sends END_TURN", () => {
    const source = new ControlledSource(AFTER);
    mount(source, AFTER);
    press(primary());
    const sent = source.submitted.at(-1) as AuthoritativeCommand;
    expect(sent).toEqual({ type: "COMPLETE_ORDER", orderId: "S05", ceramicIds: ["c1"], endTurn: true });
    expect(accepted(AFTER, sent)).toBeNull();
    const other = new ControlledSource(AFTER);
    act(() => root.unmount());
    root = createRoot(container);
    mount(other, AFTER);
    press(secondary());
    expect(other.submitted.at(-1)).toEqual({ type: "COMPLETE_ORDER", orderId: "S05", ceramicIds: ["c1"] });
    const third = new ControlledSource(AFTER);
    act(() => root.unmount());
    root = createRoot(container);
    mount(third, AFTER);
    press($('[data-action="alt"]'));
    expect(third.submitted.at(-1)).toEqual({ type: "END_TURN" });
  });

  it("with nothing chosen End turn is the only button, the primary one", () => {
    mount(new ControlledSource("w-after-the-worker-action"), "w-after-the-worker-action");
    expect(container.querySelector('[data-action="confirm"]')).toBeNull();
    expect($('[data-action="alt"]').textContent).toBe("End turn");
    expect($('[data-action="alt"]').className).toContain("kit-btn--primary");
  });
});

describe("the Order Phase (D21): the same list, Deliver · done and Done", () => {
  it("Deliver · done is one command, accepted by the engine; Done is END_ORDER_TURN", () => {
    const source = new ControlledSource(ORDER);
    mount(source, ORDER);
    expect([...container.querySelectorAll<HTMLInputElement>('input[name="freeAction"]')].map((input) => input.value)).toEqual(["complete-S05", "sell_flawed", "imperial_priority"]);
    expect(primary().textContent).toBe("Deliver · done");
    expect(secondary().textContent).toBe("Deliver");
    expect($('[data-action="alt"]').textContent).toBe("Done");
    press(primary());
    const sent = source.submitted.at(-1) as AuthoritativeCommand;
    expect(sent).toEqual({ type: "COMPLETE_ORDER", orderId: "S05", ceramicIds: ["c1"], endTurn: true });
    expect(accepted(ORDER, sent)).toBeNull();
    const other = new ControlledSource(ORDER);
    act(() => root.unmount());
    root = createRoot(container);
    mount(other, ORDER);
    press($('[data-action="alt"]'));
    expect(other.submitted.at(-1)).toEqual({ type: "END_ORDER_TURN" });
  });

  it("each entry names its own buttons, and Use on the token and Sell 2 choose the same entries", () => {
    const source = new ControlledSource(ORDER);
    mount(source, ORDER, <GameScreen />);
    const pane = () => $("aside.pane");
    press($('[data-act="sell"]'));
    expect($<HTMLInputElement>('input[name="freeAction"][value="sell_flawed"]').checked).toBe(true);
    expect(pane().querySelector('[data-action="confirm"]')?.textContent).toBe("Sell · done");
    expect(pane().querySelector('[data-action="confirm-stay"]')?.textContent).toBe("Sell");
    press($('[data-act="imperial-priority"]'));
    expect($<HTMLInputElement>('input[name="freeAction"][value="imperial_priority"]').checked).toBe(true);
    expect(pane().querySelector('[data-action="confirm"]')?.textContent).toBe("Imperial Priority · done");
    expect($('[data-act="imperial-priority"]').textContent).toBe("Chosen");
    // Round 2: the form says when the ceramic fires.
    expect(pane().textContent).toContain("fired in the next round’s firing");
    press($<HTMLButtonElement>('[data-order-id="S05"] [data-act="order"]'));
    expect($<HTMLInputElement>('input[name="freeAction"][value="complete-S05"]').checked).toBe(true);
  });

  it("the Colour Samples swap is not offered there (R28); Chinese labels", () => {
    mount(new ControlledSource(ORDER), ORDER, <DecisionPane />, "desktop", "zh-CN");
    expect(container.querySelector('input[name="freeAction"][value="colour_samples_swap"]')).toBeNull();
    expect(primary().textContent).toBe("交付并结束回合");
    expect(secondary().textContent).toBe("交付");
    // 完成 is the verb of completing an Order here, so the button says what it does.
    expect($('[data-action="alt"]').textContent).toBe("结束回合");
  });
});
