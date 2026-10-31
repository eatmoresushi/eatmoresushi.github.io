/**
 * Draft tables of B4's windows (UI_V1.6.1_ARCHITECTURE §3.5, §9.2, §10.3 B4). Owner: B4.
 *
 * Every draft model is pure, so it is tested in node on real fixtures: `initial` pre-selects
 * nothing unless only one choice exists; `reduce` accepts only offered choices and
 * `revalidate` drops what the options no longer offer; `build` is null until complete; every
 * list agrees with its engine selector (§5 gaps 10, 12, 14–16) — React computes no rule.
 */
import { describe, expect, it } from "vitest";
import {
  TECHS,
  commissionOptions,
  dingCopyableVesselIndexes,
  formDiscountVariants,
  glazeLoadVesselOptions,
  guildInspectionOptions,
  guildOptions,
  imperialPriorityOptions,
  kilnMasterOption,
  kilnSelectionOptions,
  legalActions,
  loadDestinationOptions,
  lookedOrderOptions,
  magistratesHallQuote,
  materialsYardOptions,
  placementLimits,
  placementOptions,
  quoteFormDecorate,
  quoteGlazeLoad,
  quoteMaterialsYard,
  settersMarkOptions,
  sellFlawedOptions,
  freeActionOptions,
  setupChoiceOptions,
  validateAction,
  vesselCoins,
  DECORATIONS,
  SHAPES,
} from "../../../../src/game/index.ts";
import type { ActorView, GameAction, KilnId, LoadSpec, OrderId, PlayerView } from "../../../../src/game/index.ts";
import { WINDOWS } from "../../../../src/app/decision/windows.ts";
import { colourSamplesSwapDraft } from "../../../../src/app/decision/work/ColourSamplesSwap.draft.ts";
import { lookPickKey, selectDraft, slotPickKey } from "../../../../src/app/decision/work/SelectStep.draft.ts";
import { GUILD_FINISH_VALUE, guildInspectionDraft, inspectionReturnOnly, inspectionTechChooser } from "../../../../src/app/decision/work/GuildInspection.draft.ts";
import { imperialPriorityDraft } from "../../../../src/app/decision/work/ImperialPriority.draft.ts";
import { destinationKey } from "../../../../src/app/decision/work/locations/GlazeLoad.draft.ts";
import { workDraft } from "../../../../src/app/decision/work/workDraft.ts";
import type { WorkAction, WorkDraft } from "../../../../src/app/decision/work/workDraft.ts";
import { kilnSelectionDraft } from "../../../../src/app/decision/setup/KilnSelection.draft.ts";
import { settersMarkDraft } from "../../../../src/app/decision/setup/SettersMark.draft.ts";
import { createTranslator } from "../../../../src/app/i18n/translator.ts";
import { REVALIDATE } from "../../../../src/app/state/draftStore.ts";
import type { AnyWindowSpec } from "../../../../src/app/state/draftStore.ts";
import { buildGameModel, engineViewOf } from "../../../../src/app/state/model.ts";
import type { EngineView, GameModel } from "../../../../src/app/state/model.ts";
import { placementWorkerKey } from "../../../../src/app/state/tableSelection.ts";
import { fixture, fixtureSource } from "../support/fixtures.ts";

interface Ctx {
  view: PlayerView;
  actor: ActorView;
  model: GameModel;
  engine: EngineView;
}

function ctxOf(view: PlayerView): Ctx {
  const engine = engineViewOf(view);
  if (engine.actor === null) throw new Error("not seated");
  return { view, actor: engine.actor, model: buildGameModel(view, []), engine };
}

function ctx(id: string): Ctx {
  return ctxOf(structuredClone(fixture(id).playerView));
}

/** The value at `index`, or a test failure. */
function at<T>(items: readonly T[] | undefined, index: number): T {
  const item = items?.[index];
  if (item === undefined) throw new Error(`no item ${index}`);
  return item;
}

const EN = createTranslator("en", { strict: true });
const ZH = createTranslator("zh-CN", { strict: true });

/** Reduces a sequence of work actions from the initial draft. */
function work(c: Ctx, ...actions: WorkAction[]): WorkDraft {
  let draft = workDraft.initial(c.model, c.engine);
  for (const action of actions) draft = workDraft.reduce(draft, action, c.model, c.engine);
  return draft;
}

/** The ConfirmBar sentence in both languages, which must never show an internal ID (D9). */
function sentences(spec: AnyWindowSpec, draft: unknown, c: Ctx): [string, string] {
  const message = spec.draft.summary(draft, c.model, c.engine);
  if (message === null) return ["", ""];
  const both: [string, string] = [EN.message(message), ZH.message(message)];
  for (const text of both) expect(text).not.toMatch(/\bc\d+\b|\bp\d+:/);
  return both;
}

const RICH = "w-before-the-worker-action-rich-4-player-start";
const DING = "w-before-the-worker-action-colour-samples-swap-imperial-priority-with-reworking-table-ding";
const INVERTED = "w-before-the-worker-action-kiln-furniture-inverted-firing-targets-setters-marks-senior-apprentice";
const FURNITURE = "t-glaze-load-imperial-furniture";
const KM_FUEL = "w-before-the-worker-action-kiln-master-at-loading-the-magistrates-hall-shifus-crown-order-the-kiln-fuel";

// ── The work turn ─────────────────────────────────────────────────────────────────────────

describe("work draft: worker, location and per-location sub-drafts", () => {
  it("pre-selects nothing when several workers exist; Place is the step", () => {
    const c = ctx(RICH);
    const draft = workDraft.initial(c.model, c.engine);
    expect(draft.mode).toBe("place");
    expect(draft.workerKey).toBeNull();
    expect(draft.locationId).toBeNull();
    expect(workDraft.build(draft, c.model, c.engine)).toBeNull();
    expect(sentences(WINDOWS.work, draft, c)[0]).toBe("Place a worker on an open action space.");
  });

  it("pre-selects the only worker kind left, but not a location among several", () => {
    // m5: Zhao's three Apprentices are placed; only the Shifu is left.
    const c = ctx("m5_two_player_board_2p");
    const draft = workDraft.initial(c.model, c.engine);
    expect(draft.workerKey).toBe("shifu");
    expect(draft.locationId).toBeNull();
  });

  it("offers the worker entries of placementOptions, Senior Apprentice included", () => {
    const c = ctx(INVERTED);
    const options = workDraft.options(workDraft.initial(c.model, c.engine), c.model, c.engine);
    const keys = new Set(placementOptions(c.view).flatMap((option) => option.workers.map(placementWorkerKey)));
    expect(options.workers.map((worker) => worker.key)).toEqual(["shifu", "apprentice", "apprentice-senior"]);
    expect(new Set(options.workers.map((worker) => worker.key))).toEqual(keys);
  });

  it("marks each location legal exactly as placementOptions does, with the engine's reason (gap 12)", () => {
    for (const id of ["m1_work_phase_r2_3p", "m5_two_player_board_2p", RICH, DING]) {
      const c = ctx(id);
      for (const key of ["shifu", "apprentice"]) {
        const draft = work(c, { type: "worker", workerKey: key });
        if (draft.workerKey !== key) continue;
        const options = workDraft.options(draft, c.model, c.engine);
        for (const choice of options.locations) {
          const entry = placementOptions(c.view).find((option) => option.locationId === choice.locationId)?.workers.find((worker) => placementWorkerKey(worker) === key);
          expect(choice.legal, `${id} ${key} ${choice.locationId}`).toBe(entry?.legal === true);
          expect(choice.error).toEqual(entry?.error ?? null);
        }
      }
    }
  });

  it("explains a second personal space not yet added in D7 wording", () => {
    // m1 with Zhao's Materials Yard Apprentice on the first Glaze & Load space instead: the second is not added yet.
    const c = ctxWith("m1_work_phase_r2_3p", (view) => {
      const worker = viewer(view).workers["p2:apprentice:1"];
      if (worker?.placement?.locationId !== "materials_yard") throw new Error("fixture changed");
      worker.placement = { ...worker.placement, locationId: "glaze_load", spaceIndex: 0 };
      if (viewer(view).personalSpaces.glaze_load[1].unlocked) throw new Error("fixture changed: the second Glaze & Load space is added");
    });
    const options = workDraft.options(workDraft.initial(c.model, c.engine), c.model, c.engine);
    const glaze = options.locations.find((choice) => choice.locationId === "glaze_load");
    expect(glaze?.error?.code).toBe("PERSONAL_SPACE_LOCKED");
  });

  it("ignores an unavailable location, and takes the only legal worker of a location", () => {
    const c = ctx("m5_two_player_board_2p");
    expect(work(c, { type: "location", locationId: "guild_hall" }).locationId).toBeNull();
    expect(work(c, { type: "location", locationId: "form_decorate" }).locationId).toBeNull();
    const draft = work(c, { type: "location", locationId: "commission_market" });
    expect(draft.locationId).toBe("commission_market");
    expect(draft.workerKey).toBe("shifu");
  });

  it("keeps each location's sub-draft while the player looks at other locations (§3.5)", () => {
    const c = ctx(DING);
    let draft = work(c, { type: "worker", workerKey: "shifu" }, { type: "location", locationId: "glaze_load" });
    draft = workDraft.reduce(draft, { type: "sub", locationId: "glaze_load", action: { type: "vessel", index: 0, ceramicId: "c2" } }, c.model, c.engine);
    draft = workDraft.reduce(draft, { type: "sub", locationId: "glaze_load", action: { type: "glaze", index: 0, glaze: "celadon" } }, c.model, c.engine);
    const glaze = draft.perLocation.glaze_load;
    draft = workDraft.reduce(draft, { type: "location", locationId: "materials_yard" }, c.model, c.engine);
    draft = workDraft.reduce(draft, { type: "sub", locationId: "materials_yard", action: { type: "clay", clay: 2 } }, c.model, c.engine);
    draft = workDraft.reduce(draft, { type: "location", locationId: "glaze_load" }, c.model, c.engine);
    expect(draft.perLocation.glaze_load).toEqual(glaze);
    expect(draft.perLocation.materials_yard.clay).toBe(2);
  });

  it("revalidates the active sub-draft when the worker changes (the Apprentice forms 1 vessel)", () => {
    const c = ctx(RICH);
    let draft = work(c, { type: "worker", workerKey: "shifu" }, { type: "location", locationId: "form_decorate" });
    draft = workDraft.reduce(draft, { type: "sub", locationId: "form_decorate", action: { type: "second", on: true } }, c.model, c.engine);
    expect(draft.perLocation.form_decorate.vessels).toHaveLength(2);
    draft = workDraft.reduce(draft, { type: "worker", workerKey: "apprentice" }, c.model, c.engine);
    expect(draft.locationId).toBe("form_decorate");
    expect(draft.perLocation.form_decorate.vessels).toHaveLength(1);
  });

  it("drops a worker key and location the options no longer offer, and keeps an unchanged draft identical", () => {
    // The rich start's viewer has no Senior Apprentice, and the Guild Hall is not legal there.
    const c = ctx(RICH);
    const stale: WorkDraft = { ...work(c), workerKey: "apprentice-senior", locationId: "guild_hall" };
    const next = workDraft.reduce(stale, REVALIDATE, c.model, c.engine);
    expect(next.workerKey).toBeNull();
    expect(next.locationId).toBeNull();
    const settled = work(c, { type: "worker", workerKey: "shifu" }, { type: "location", locationId: "canal_wharf" });
    expect(workDraft.reduce(settled, REVALIDATE, c.model, c.engine)).toBe(settled);
  });

  it("builds the placement and says so in both languages", () => {
    const c = ctx(RICH);
    const draft = work(c, { type: "worker", workerKey: "shifu" }, { type: "location", locationId: "canal_wharf" });
    const command = workDraft.build(draft, c.model, c.engine);
    expect(command).toEqual({ type: "PLACE_CANAL_WHARF", workerId: `${c.view.viewerId}:shifu` });
    expect(validateAction(c.actor, command as GameAction)).toBeNull();
    const [en, zh] = sentences(WINDOWS.work, draft, c);
    expect(en).toBe("Place Shifu at Canal Wharf — +4 Coins and the top Main Order card, unseen");
    expect(zh).toBe("派师傅到漕运码头：得4铜钱，并不看牌面拿取主委托牌堆顶的牌");
  });

  it("offers the free actions and the Colour Samples swap before the action when they are usable (owner revision 5)", () => {
    const c = ctx(DING);
    const options = workDraft.options(workDraft.initial(c.model, c.engine), c.model, c.engine);
    expect(options.modes.map((mode) => mode.mode)).toEqual(["place", "complete_order", "imperial_priority", "colour_samples_swap"]);
    // Completing a held Order is a free action (change 36): the completable ones from the engine.
    expect(options.completion?.orders).toEqual(freeActionOptions(c.view)!.completableOrderIds.map((orderId) => ({ orderId, completable: true })));
    expect(options.imperialPriority?.usable).toBe(true);
    expect(options.swap?.usable).toBe(true);
    expect(options.swap?.discards.map((discard) => discard.orderId)).toEqual(c.view.own?.orderHand);
    const plain = ctx("m1_work_phase_r2_3p");
    expect(workDraft.options(workDraft.initial(plain.model, plain.engine), plain.model, plain.engine).modes.map((mode) => mode.mode)).toEqual(["place"]);
  });

  it("after the action: the free-action list, End turn the alternative; nothing is chosen at first, even with one entry (D21)", () => {
    const after = ctx("w-after-the-worker-action");
    const draft = workDraft.initial(after.model, after.engine);
    const options = workDraft.options(draft, after.model, after.engine);
    expect(options.modes.map((mode) => mode.mode)).toEqual(["complete_order", "imperial_priority", "colour_samples_swap", "end_turn"]);
    expect(options.freeActions.map((item) => item.key)).toEqual(["complete-O01", "imperial_priority", "colour_samples_swap"]);
    expect(draft.mode).toBeNull();
    expect(workDraft.summary(draft, after.model, after.engine)?.key).toBe("orders.turn.pick");
    expect(WINDOWS.work.alternative?.(draft, after.model, after.engine)?.command).toEqual({ type: "END_TURN" });
    expect(WINDOWS.work.alternativeOnly?.(draft, after.model, after.engine)).toBe(true);
    const ending = workDraft.reduce(draft, { type: "mode", mode: "end_turn" }, after.model, after.engine);
    expect(workDraft.build(ending, after.model, after.engine)).toEqual({ type: "END_TURN" });
    // m17: the swap is the only entry, and it still waits for the player's own press.
    const swap = ctx("m17_after_action");
    const first = workDraft.initial(swap.model, swap.engine);
    expect(first.mode).toBeNull();
    expect(WINDOWS.work.alternativeOnly?.(first, swap.model, swap.engine)).toBe(true);
    const chosen = workDraft.reduce(first, { type: "freeAction", key: "colour_samples_swap" }, swap.model, swap.engine);
    expect(chosen.mode).toBe("colour_samples_swap");
    expect(WINDOWS.work.alternativeOnly?.(chosen, swap.model, swap.engine)).toBe(false);
    // m17 after the swap was used this round: nothing to choose; End turn is the only button.
    const only = ctxWith("m17_after_action", (view) => {
      const p = viewer(view);
      p.techs = p.techs.map((tech) => (tech.id === "T10" ? { ...tech, usedThisRound: true } : tech));
    });
    const empty = workDraft.initial(only.model, only.engine);
    expect(workDraft.options(empty, only.model, only.engine).freeActions).toEqual([]);
    expect(empty.mode).toBeNull();
    expect(workDraft.summary(empty, only.model, only.engine)).toBeNull();
    expect(WINDOWS.work.alternativeOnly?.(empty, only.model, only.engine)).toBe(true);
  });

  it("the Colour Samples swap: gives up a held Order the engine allows, and builds USE_COLOUR_SAMPLES_SWAP (v1.6.2 L622)", () => {
    const c = ctx("m17_after_action");
    let draft = workDraft.reduce(workDraft.initial(c.model, c.engine), { type: "mode", mode: "colour_samples_swap" }, c.model, c.engine);
    expect(draft.mode).toBe("colour_samples_swap");
    expect(workDraft.build(draft, c.model, c.engine)).toBeNull();
    expect(sentences(WINDOWS.work, draft, c)[0]).toBe("Choose a held Order to give up.");
    const hand = c.view.own?.orderHand ?? [];
    const options = colourSamplesSwapDraft.options(draft.swap, c.model, c.engine);
    expect(options.discards.map((discard) => discard.orderId)).toEqual(hand);
    expect(options.discards.every((discard) => discard.legal && discard.lookCount > 0 && discard.reason === null)).toBe(true);
    // An Order not in hand is ignored.
    expect(workDraft.reduce(draft, { type: "swap", action: { type: "discard", orderId: "O01" } }, c.model, c.engine).swap.discardOrderId).toBeNull();
    draft = workDraft.reduce(draft, { type: "swap", action: { type: "discard", orderId: at(hand, 1) } }, c.model, c.engine);
    const command = workDraft.build(draft, c.model, c.engine);
    expect(command).toEqual({ type: "USE_COLOUR_SAMPLES_SWAP", discardOrderId: hand[1] });
    expect(validateAction(c.actor, command as GameAction)).toBeNull();
    const [en, zh] = sentences(WINDOWS.work, draft, c);
    expect(en).toBe(`Colour Samples: give up ${hand[1]}, then Select 3`);
    expect(zh).toBe(`「色样簿」换单：弃${hand[1]}，然后精选3`);
    expect(workDraft.fromCommand(command!, c.model, c.engine)).toMatchObject({ mode: "colour_samples_swap", swap: { discardOrderId: hand[1] } });
  });

  it("the Colour Samples swap: with no card to look at, the display still offers its Select's reservation (v1.6.2 L64, B1)", () => {
    // Both Main piles empty and only a Starting Order held: the look would see no card, but a face-up Order can be reserved.
    const c = ctxWith("m17_after_action", (view) => {
      view.game.counts = { ...view.game.counts, mainDeck: 0, mainDiscard: 0 };
      const own = view.own;
      if (own === null) throw new Error("no own view");
      own.orderHand = own.orderHand.filter((orderId) => orderId.startsWith("S"));
      view.game.counts.orderHands = { ...view.game.counts.orderHands, [view.viewerId!]: own.orderHand.length };
    });
    const options = colourSamplesSwapDraft.options(colourSamplesSwapDraft.initial(c.model, c.engine), c.model, c.engine);
    const starting = at(options.discards, 0);
    expect(starting).toMatchObject({ legal: true, lookCount: 0, short: false, none: true, reason: null });
    const draft = colourSamplesSwapDraft.reduce(colourSamplesSwapDraft.initial(c.model, c.engine), { type: "discard", orderId: starting.orderId }, c.model, c.engine);
    expect(draft.discardOrderId).toBe(starting.orderId);
    expect(validateAction(c.actor, colourSamplesSwapDraft.build(draft, c.model, c.engine) as GameAction)).toBeNull();
  });

  it("the Colour Samples swap: a discard that leaves nothing to reserve carries the engine's reason (B1)", () => {
    // Both Main piles empty, an empty display and only a Starting Order held: no Order at all to reserve.
    const c = ctxWith("m17_after_action", (view) => {
      view.game.counts = { ...view.game.counts, mainDeck: 0, mainDiscard: 0 };
      view.game.market.display = view.game.market.display.map(() => null);
      const own = view.own;
      if (own === null) throw new Error("no own view");
      own.orderHand = own.orderHand.filter((orderId) => orderId.startsWith("S"));
      view.game.counts.orderHands = { ...view.game.counts.orderHands, [view.viewerId!]: own.orderHand.length };
    });
    const options = colourSamplesSwapDraft.options(colourSamplesSwapDraft.initial(c.model, c.engine), c.model, c.engine);
    const starting = at(options.discards, 0);
    expect(starting.legal).toBe(false);
    expect(starting.lookCount).toBe(0);
    expect(starting.reason?.code).toBe("ORDER_SUPPLY_EMPTY");
    const draft = colourSamplesSwapDraft.reduce(colourSamplesSwapDraft.initial(c.model, c.engine), { type: "discard", orderId: starting.orderId }, c.model, c.engine);
    expect(draft.discardOrderId).toBeNull();
  });

  it("has no End turn before the action and no alternative there", () => {
    const c = ctx("m1_work_phase_r2_3p");
    const draft = workDraft.reduce(work(c), { type: "mode", mode: "end_turn" }, c.model, c.engine);
    expect(draft.mode).toBe("place");
    expect(WINDOWS.work.alternative?.(draft, c.model, c.engine)).toBeNull();
  });
});

// ── Location sub-drafts ───────────────────────────────────────────────────────────────────

describe("Materials Yard sub-draft (gap 14)", () => {
  it("offers every split of the worker's resources: 4 for the Apprentice, 8 for the Shifu and Senior Apprentice, with no Coin option (rev. 4 L176–177, change 34)", () => {
    const c = ctx(INVERTED);
    for (const [key, total] of [
      ["shifu", 8],
      ["apprentice", 4],
      ["apprentice-senior", 8],
    ] as const) {
      const draft = work(c, { type: "place", locationId: "materials_yard", workerKey: key });
      const active = workDraft.options(draft, c.model, c.engine).active;
      if (active?.locationId !== "materials_yard") throw new Error(`no Materials Yard for ${key}`);
      const worker = placementOptions(c.view).find((option) => option.locationId === "materials_yard")?.workers.find((entry) => placementWorkerKey(entry) === key);
      if (worker === undefined) throw new Error(`no ${key}`);
      const selector = materialsYardOptions(c.view, worker);
      expect(selector.resources, key).toBe(total);
      expect(active.options.resources, key).toBe(total);
      expect(active.options.splits.map((split) => split.clay + split.wood), key).toEqual(new Array(total + 1).fill(total));
      expect(Object.keys(active.options).sort(), key).toEqual(["after", "preparedClay", "quote", "resources", "splits"]);
    }
  });

  it("builds a split of 8 for the Shifu and quotes it with quoteMaterialsYard", () => {
    const c = ctx(RICH);
    let draft = work(c, { type: "worker", workerKey: "shifu" }, { type: "location", locationId: "materials_yard" });
    draft = workDraft.reduce(draft, { type: "sub", locationId: "materials_yard", action: { type: "clay", clay: 5 } }, c.model, c.engine);
    const command = workDraft.build(draft, c.model, c.engine);
    expect(command).toMatchObject({ type: "PLACE_MATERIALS_YARD", clay: 5, wood: 3 });
    expect(command).not.toHaveProperty("buyShifuBonus");
    const active = workDraft.options(draft, c.model, c.engine).active;
    if (active?.locationId !== "materials_yard" || command?.type !== "PLACE_MATERIALS_YARD") throw new Error("no Materials Yard");
    expect(active.options.quote).toEqual(quoteMaterialsYard(c.actor, command));
    expect(validateAction(c.actor, command)).toBeNull();
  });

  it("offers Prepared Clay Decorations per chosen Shape from the selector's legal pairs only", () => {
    const view = structuredClone(fixture(INVERTED).playerView);
    const me = view.viewerId;
    if (me === null) throw new Error("no viewer");
    const player = view.game.players[me];
    if (player === undefined) throw new Error("no player");
    player.resources = { clay: 0, wood: 2, coins: 3 };
    // The viewer holds Prepared Clay (T17) in place of its Form & Decorate Tech, ready this round.
    player.techs = player.techs.map((tech) => (tech.id === "T18" ? { ...tech, id: "T17", usedThisRound: false } : tech));
    if (!player.techs.some((tech) => tech.id === "T17")) throw new Error("fixture changed: the viewer owns no Form & Decorate Tech to swap");
    const c = ctxOf(view);
    const worker = placementOptions(view).find((option) => option.locationId === "materials_yard")?.workers.find((entry) => entry.kind === "shifu");
    if (worker === undefined) throw new Error("no Shifu");
    const pairs = materialsYardOptions(view, worker).preparedClay?.pairs ?? [];
    expect(pairs.length).toBeGreaterThan(0);
    let draft = work(c, { type: "worker", workerKey: "shifu" }, { type: "location", locationId: "materials_yard" });
    draft = workDraft.reduce(draft, { type: "sub", locationId: "materials_yard", action: { type: "preparedClay", on: true } }, c.model, c.engine);
    for (const shape of SHAPES) {
      const shaped = workDraft.reduce(draft, { type: "sub", locationId: "materials_yard", action: { type: "pcShape", shape } }, c.model, c.engine);
      const active = workDraft.options(shaped, c.model, c.engine).active;
      if (active?.locationId !== "materials_yard") throw new Error("no Materials Yard");
      const legal = pairs.filter((pair) => pair.shape === shape).map((pair) => pair.decoration);
      if (legal.length === 0) {
        expect(shaped.perLocation.materials_yard.preparedClay?.shape ?? null).toBeNull();
        continue;
      }
      expect(active.options.preparedClay?.decorations).toEqual(legal);
      for (const decoration of DECORATIONS) {
        const chosen = workDraft.reduce(shaped, { type: "sub", locationId: "materials_yard", action: { type: "pcDecoration", decoration } }, c.model, c.engine);
        expect(chosen.perLocation.materials_yard.preparedClay?.decoration ?? null).toBe(legal.includes(decoration) ? decoration : null);
      }
    }
  });
});

describe("Form & Decorate sub-draft (gap 6)", () => {
  it("quotes all 20 single vessels live with quoteFormDecorate, agreeing with validateAction", () => {
    for (const [id, key] of [
      [RICH, "shifu"],
      [RICH, "apprentice"],
    ] as const) {
      const c = ctx(id);
      const base = work(c, { type: "worker", workerKey: key }, { type: "location", locationId: "form_decorate" });
      let quoted = 0;
      for (const shape of SHAPES) {
        for (const decoration of DECORATIONS) {
          let draft = workDraft.reduce(base, { type: "sub", locationId: "form_decorate", action: { type: "shape", index: 0, shape } }, c.model, c.engine);
          draft = workDraft.reduce(draft, { type: "sub", locationId: "form_decorate", action: { type: "decoration", index: 0, decoration } }, c.model, c.engine);
          const command = workDraft.build(draft, c.model, c.engine);
          if (command?.type !== "PLACE_FORM_DECORATE") throw new Error(`${shape} ${decoration}: no command`);
          expect(command.vessels).toEqual([{ shape, decoration }]);
          const active = workDraft.options(draft, c.model, c.engine).active;
          if (active?.locationId !== "form_decorate") throw new Error("no Form & Decorate");
          expect(active.options.quote).toEqual(quoteFormDecorate(c.actor, command));
          expect(active.options.quote?.ok, `${id} ${shape} ${decoration}`).toBe(validateAction(c.actor, command) === null);
          quoted += 1;
        }
      }
      expect(quoted).toBe(20);
    }
  });

  it("shows each Shape's printed Clay and a vessel's 2 Coins from the quote lines; a Decoration has no cost of its own (rev. 4 L183, L336, change 30)", () => {
    const c = ctx(RICH);
    const draft = work(c, { type: "worker", workerKey: "shifu" }, { type: "location", locationId: "form_decorate" });
    const active = workDraft.options(draft, c.model, c.engine).active;
    if (active?.locationId !== "form_decorate") throw new Error("no Form & Decorate");
    expect(active.options.shapes.map((entry) => entry.shape)).toEqual([...SHAPES]);
    expect(active.options.shapes.map((entry) => entry.clay)).toEqual([1, 1, 1, 2, 2]);
    expect(active.options.vesselCoins).toBe(vesselCoins());
    expect(active.options.vesselCoins).toBe(2);
    expect(active.options.decorations.map((entry) => Object.keys(entry))).toEqual(DECORATIONS.map(() => ["decoration"]));
    expect(active.options.maxVessels).toBe(placementLimits(c.view, "form_decorate", "shifu").maxVessels);
    // Every Decoration costs the same: the quote of one vessel names its Clay and its 2 Coins only.
    for (const decoration of DECORATIONS) {
      const one = workDraft.reduce(
        workDraft.reduce(draft, { type: "sub", locationId: "form_decorate", action: { type: "shape", index: 0, shape: "bowl" } }, c.model, c.engine),
        { type: "sub", locationId: "form_decorate", action: { type: "decoration", index: 0, decoration } },
        c.model,
        c.engine,
      );
      const quote = workDraft.options(one, c.model, c.engine).active;
      if (quote?.locationId !== "form_decorate") throw new Error("no Form & Decorate");
      expect(quote.options.quote?.lines.map((line) => [line.kind, line.amount]), decoration).toEqual([
        ["shape_clay", 1],
        ["vessel_coins", 2],
      ]);
    }
  });

  it("forming 2 with the Shifu: one vessel costs 1 Coin less, as the quote's shifu_discount line (rev. 4 L184)", () => {
    const c = ctx(RICH);
    let draft = work(c, { type: "worker", workerKey: "shifu" }, { type: "location", locationId: "form_decorate" });
    for (const action of [
      { type: "second", on: true },
      { type: "shape", index: 0, shape: "bowl" },
      { type: "decoration", index: 0, decoration: "plain" },
      { type: "shape", index: 1, shape: "plate" },
      { type: "decoration", index: 1, decoration: "painted" },
    ] as const) {
      draft = workDraft.reduce(draft, { type: "sub", locationId: "form_decorate", action }, c.model, c.engine);
    }
    const active = workDraft.options(draft, c.model, c.engine).active;
    if (active?.locationId !== "form_decorate") throw new Error("no Form & Decorate");
    expect(active.options.quote?.lines.map((line) => [line.kind, line.amount])).toEqual([
      ["shape_clay", 1],
      ["shape_clay", 1],
      ["vessel_coins", 2],
      ["vessel_coins", 2],
      ["shifu_discount", -1],
    ]);
    expect(active.options.quote?.pay).toEqual({ clay: 2, wood: 0, coins: 3 });
  });

  it("offers Ding's extra vessel on the indexes dingCopyableVesselIndexes lists", () => {
    const c = ctx(DING);
    let draft = work(c, { type: "worker", workerKey: "shifu" }, { type: "location", locationId: "form_decorate" });
    const step = (action: Extract<WorkAction, { type: "sub"; locationId: "form_decorate" }>["action"]) => {
      draft = workDraft.reduce(draft, { type: "sub", locationId: "form_decorate", action }, c.model, c.engine);
    };
    step({ type: "second", on: true });
    step({ type: "shape", index: 0, shape: "vase" });
    step({ type: "decoration", index: 0, decoration: "plain" });
    step({ type: "shape", index: 1, shape: "plate" });
    step({ type: "decoration", index: 1, decoration: "carved" });
    step({ type: "ding", on: true });
    const active = workDraft.options(draft, c.model, c.engine).active;
    if (active?.locationId !== "form_decorate") throw new Error("no Form & Decorate");
    const workerId = placementOptions(c.view).find((option) => option.locationId === "form_decorate")?.workers.find((worker) => worker.kind === "shifu")?.workerId ?? "";
    const vessels = [{ shape: "vase" as const, decoration: "plain" as const }, { shape: "plate" as const, decoration: "carved" as const }];
    const copyable = dingCopyableVesselIndexes(c.view, { type: "PLACE_FORM_DECORATE", workerId, vessels });
    expect(active.options.ding?.indexes).toEqual(copyable);
    // Ding never copies a Vase (L652): only the Plate may be copied, so it is taken at once.
    expect(copyable).toEqual([1]);
    expect(draft.perLocation.form_decorate.ding?.index).toBe(1);
    step({ type: "dingIndex", index: 0 });
    expect(draft.perLocation.form_decorate.ding?.index).toBe(1);
    step({ type: "dingDecoration", decoration: "painted" });
    const command = workDraft.build(draft, c.model, c.engine);
    expect(command).toMatchObject({ dingExtra: { copyOfVesselIndex: 1, decoration: "painted" } });
    expect(validateAction(c.actor, command as GameAction)).toBeNull();
    expect(formDiscountVariants(c.view, c.actor.viewerId, vessels).some((variant) => variant.useLargeThrowingWheel === true)).toBe(active.options.wheel !== null);
  });

  it("needs every vessel's Shape and Decoration before it builds", () => {
    const c = ctx(RICH);
    let draft = work(c, { type: "worker", workerKey: "shifu" }, { type: "location", locationId: "form_decorate" });
    draft = workDraft.reduce(draft, { type: "sub", locationId: "form_decorate", action: { type: "shape", index: 0, shape: "bowl" } }, c.model, c.engine);
    expect(workDraft.build(draft, c.model, c.engine)).toBeNull();
    expect(sentences(WINDOWS.work, draft, c)[0]).toBe("Place Shifu at Form & Decorate");
  });
});

describe("Glaze & Load sub-draft (gap 15)", () => {
  function glazeDraft(c: Ctx, key = "shifu"): WorkDraft {
    return work(c, { type: "worker", workerKey: key }, { type: "location", locationId: "glaze_load" });
  }
  const sub = (action: Extract<WorkAction, { type: "sub"; locationId: "glaze_load" }>["action"]): WorkAction => ({ type: "sub", locationId: "glaze_load", action });

  it("lists the vessels, Glazes, rework Shapes and destinations the selectors give", () => {
    const c = ctx(DING);
    let draft = glazeDraft(c);
    const vessels = glazeLoadVesselOptions(c.view, c.actor.viewerId, []);
    let active = workDraft.options(draft, c.model, c.engine).active;
    if (active?.locationId !== "glaze_load") throw new Error("no Glaze & Load");
    expect(active.options.loads[0]?.vessels.map((vessel) => vessel.ceramicId)).toEqual(vessels.map((vessel) => vessel.ceramicId));
    draft = workDraft.reduce(draft, sub({ type: "vessel", index: 0, ceramicId: "c1" }), c.model, c.engine);
    active = workDraft.options(draft, c.model, c.engine).active;
    if (active?.locationId !== "glaze_load") throw new Error("no Glaze & Load");
    const load = active.options.loads[0];
    expect(load?.glazes).toEqual(vessels[0]?.glazes);
    expect(load?.reworkShapes).toEqual(vessels[0]?.reworkShapes);
    const keys = (load?.places ?? []).flatMap((place) => place.variants.map((variant) => variant.key)).sort();
    expect(keys).toEqual(loadDestinationOptions(c.view, c.actor.viewerId, "c1", []).map((option) => destinationKey(option.destination)).sort());
    const imperial = load?.places.find((place) => place.kind === "imperial");
    expect(imperial?.variants.map((variant) => variant.modifier)).toEqual([-1, 0, 1]);
  });

  it("queries the second load after the first (R8) and builds both in order", () => {
    const c = ctx(DING);
    let draft = glazeDraft(c);
    for (const action of [
      sub({ type: "vessel", index: 0, ceramicId: "c1" }),
      sub({ type: "glaze", index: 0, glaze: "celadon" }),
      sub({ type: "place", index: 0, place: "imperial" }),
      sub({ type: "destination", index: 0, key: "imperial:1" }),
      sub({ type: "second", on: true }),
      sub({ type: "vessel", index: 1, ceramicId: "c2" }),
      sub({ type: "glaze", index: 1, glaze: "white" }),
    ]) draft = workDraft.reduce(draft, action, c.model, c.engine);
    const active = workDraft.options(draft, c.model, c.engine).active;
    if (active?.locationId !== "glaze_load") throw new Error("no Glaze & Load");
    const first: LoadSpec = { ceramicId: "c1", glaze: "celadon", destination: { kiln: "imperial", imperialModifier: 1 } };
    const second = active.options.loads[1];
    expect(second?.vessels.map((vessel) => vessel.ceramicId)).toEqual(glazeLoadVesselOptions(c.view, c.actor.viewerId, [first]).map((vessel) => vessel.ceramicId));
    expect((second?.places ?? []).some((place) => place.kind === "imperial")).toBe(false);
    draft = workDraft.reduce(draft, sub({ type: "place", index: 1, place: "high_1" }), c.model, c.engine);
    const command = workDraft.build(draft, c.model, c.engine);
    expect(command).toMatchObject({ type: "PLACE_GLAZE_LOAD", loads: [first, { ceramicId: "c2", glaze: "white", destination: { kiln: "shared", spaceId: "high_1" } }] });
    expect(validateAction(c.actor, command as GameAction)).toBeNull();
    const [en] = sentences(WINDOWS.work, draft, c);
    expect(en).toContain("Imperial Kiln (+1)");
  });

  it("chooses Kiln Furniture's modifier on a space, and leaves the plain way in as one choice", () => {
    const c = ctx(FURNITURE);
    let draft = glazeDraft(c);
    draft = workDraft.reduce(draft, sub({ type: "vessel", index: 0, ceramicId: "c1" }), c.model, c.engine);
    draft = workDraft.reduce(draft, sub({ type: "place", index: 0, place: "middle_1" }), c.model, c.engine);
    expect(draft.perLocation.glaze_load.loads[0]?.destination).toBeNull();
    const active = workDraft.options(draft, c.model, c.engine).active;
    if (active?.locationId !== "glaze_load") throw new Error("no Glaze & Load");
    const place = active.options.loads[0]?.places.find((candidate) => candidate.key === "middle_1");
    expect(place?.variants.map((variant) => variant.kind)).toEqual(["zone", "furniture", "furniture", "furniture"]);
    draft = workDraft.reduce(draft, sub({ type: "destination", index: 0, key: "middle_1:kf-1" }), c.model, c.engine);
    expect(draft.perLocation.glaze_load.loads[0]?.destination).toEqual({ kiln: "shared", spaceId: "middle_1", kilnFurniture: -1 });
  });

  it("takes a place with a single way in at once (Inverted Firing onto your ceramic)", () => {
    const c = ctx(INVERTED);
    let draft = glazeDraft(c);
    draft = workDraft.reduce(draft, sub({ type: "vessel", index: 0, ceramicId: "c2" }), c.model, c.engine);
    draft = workDraft.reduce(draft, sub({ type: "place", index: 0, place: "middle_1" }), c.model, c.engine);
    expect(draft.perLocation.glaze_load.loads[0]?.destination).toEqual({ kiln: "shared", spaceId: "middle_1", invertedFiring: true });
  });

  it("prices the kiln fuel from the quote: 1 Wood for an action loading into the Shared Kiln, 1 vessel or 2; none into the Imperial Kiln only (rev. 4 L197, R24)", () => {
    const c = ctx(KM_FUEL);
    let draft = glazeDraft(c);
    const options = () => {
      const active = workDraft.options(draft, c.model, c.engine).active;
      if (active?.locationId !== "glaze_load") throw new Error("no Glaze & Load");
      return active.options;
    };
    expect(options().fuel).toEqual({ wood: 0, perAction: 1, have: 9, free: false, short: false });
    expect(options().quote).toBeNull();
    draft = workDraft.reduce(draft, sub({ type: "vessel", index: 0, ceramicId: "c1" }), c.model, c.engine);
    draft = workDraft.reduce(draft, sub({ type: "place", index: 0, place: "high_1" }), c.model, c.engine);
    // The place is enough to price the fuel, before the Glaze is chosen.
    expect(options().fuel).toMatchObject({ wood: 1, free: false });
    expect(options().quote?.lines).toEqual([{ kind: "kiln_fuel", resource: "wood", amount: 1, itemIndex: null }]);
    draft = workDraft.reduce(draft, sub({ type: "glaze", index: 0, glaze: "white" }), c.model, c.engine);
    for (const action of [sub({ type: "second", on: true }), sub({ type: "vessel", index: 1, ceramicId: "c2" }), sub({ type: "glaze", index: 1, glaze: "celadon" }), sub({ type: "place", index: 1, place: "middle_1" })]) {
      draft = workDraft.reduce(draft, action, c.model, c.engine);
    }
    // Still 1 Wood for the action with 2 Shared loads.
    expect(options().fuel.wood).toBe(1);
    expect(options().after).toEqual({ clay: 9, wood: 8, coins: 9 });
    const command = workDraft.build(draft, c.model, c.engine);
    expect(command).toMatchObject({ type: "PLACE_GLAZE_LOAD", loads: [{ ceramicId: "c1" }, { ceramicId: "c2" }] });
    expect(quoteGlazeLoad(c.actor, command as Extract<GameAction, { type: "PLACE_GLAZE_LOAD" }>).pay).toEqual({ clay: 0, wood: 1, coins: 0 });
    expect(validateAction(c.actor, command as GameAction)).toBeNull();
    const [en, zh] = sentences(WINDOWS.work, draft, c);
    expect(en).toContain("pay 1 Wood (kiln fuel)");
    expect(zh).toContain("付1柴（烧窑要烧柴）");
    // Loading only into the Imperial Kiln costs no Wood.
    const imperial = ctx(DING);
    let only = glazeDraft(imperial);
    for (const action of [sub({ type: "vessel", index: 0, ceramicId: "c1" }), sub({ type: "glaze", index: 0, glaze: "celadon" }), sub({ type: "place", index: 0, place: "imperial" }), sub({ type: "destination", index: 0, key: "imperial:0" })]) {
      only = workDraft.reduce(only, action, imperial.model, imperial.engine);
    }
    const active = workDraft.options(only, imperial.model, imperial.engine).active;
    if (active?.locationId !== "glaze_load") throw new Error("no Glaze & Load");
    expect(active.options.fuel).toMatchObject({ wood: 0, free: true });
    expect(active.options.quote?.lines).toEqual([]);
    expect(sentences(WINDOWS.work, only, imperial)[0]).not.toContain("kiln fuel");
  });

  it("without Wood offers only the Imperial Kiln (the engine offers no Shared destination, R24)", () => {
    const c = ctxWith(DING, (view) => {
      viewer(view).resources.wood = 0;
    });
    let draft = glazeDraft(c);
    draft = workDraft.reduce(draft, sub({ type: "vessel", index: 0, ceramicId: "c1" }), c.model, c.engine);
    const active = workDraft.options(draft, c.model, c.engine).active;
    if (active?.locationId !== "glaze_load") throw new Error("no Glaze & Load");
    expect(active.options.loads[0]?.places.map((place) => place.kind)).toEqual(["imperial"]);
    expect(active.options.fuel).toMatchObject({ perAction: 1, have: 0, short: true });
  });

  it("places Kiln Master's marker on one load when the tile is ready, optional, for either worker (T24, rev. 4 L628, R22)", () => {
    const c = ctx(KM_FUEL);
    let draft = glazeDraft(c);
    const options = (d: WorkDraft = draft) => {
      const active = workDraft.options(d, c.model, c.engine).active;
      if (active?.locationId !== "glaze_load") throw new Error("no Glaze & Load");
      return active.options;
    };
    expect(options().kilnMaster).toEqual({ techId: "T24", values: kilnMasterOption(c.view, c.actor.viewerId)?.values, loads: [] });
    for (const action of [sub({ type: "vessel", index: 0, ceramicId: "c1" }), sub({ type: "glaze", index: 0, glaze: "white" }), sub({ type: "place", index: 0, place: "high_1" })]) {
      draft = workDraft.reduce(draft, action, c.model, c.engine);
    }
    expect(options().kilnMaster).toMatchObject({ values: [1, -1], loads: [0] });
    // Nothing is chosen until the player chooses (R4: declining is choosing none).
    expect(draft.perLocation.glaze_load.kilnMaster).toBeNull();
    expect(workDraft.build(draft, c.model, c.engine)).toEqual({ type: "PLACE_GLAZE_LOAD", workerId: "p1:shifu", loads: [{ ceramicId: "c1", glaze: "white", destination: { kiln: "shared", spaceId: "high_1" } }] });
    // A load without a vessel cannot carry it.
    expect(workDraft.reduce(draft, sub({ type: "kilnMaster", choice: { index: 1, value: 1 } }), c.model, c.engine).perLocation.glaze_load.kilnMaster).toBeNull();
    draft = workDraft.reduce(draft, sub({ type: "kilnMaster", choice: { index: 0, value: -1 } }), c.model, c.engine);
    const command = workDraft.build(draft, c.model, c.engine);
    expect(command).toEqual({ type: "PLACE_GLAZE_LOAD", workerId: "p1:shifu", loads: [{ ceramicId: "c1", glaze: "white", destination: { kiln: "shared", spaceId: "high_1" }, kilnMaster: -1 }] });
    expect(validateAction(c.actor, command as GameAction)).toBeNull();
    expect(workDraft.fromCommand(command!, c.model, c.engine)?.perLocation).toMatchObject({ glaze_load: { kilnMaster: { index: 0, value: -1 } } });
    expect(sentences(WINDOWS.work, draft, c)[0]).toContain("Kiln Master marker −1 on");
    expect(sentences(WINDOWS.work, draft, c)[1]).toContain("窑工标−1放在");
    // The Apprentice may place it too (any loading, R22).
    expect(options(glazeDraft(c, "apprentice")).kilnMaster).not.toBeNull();
    // Not ready (used this round), or not owned: no marker.
    const used = ctxWith(KM_FUEL, (view) => {
      for (const tech of viewer(view).techs) if (tech.id === "T24") tech.usedThisRound = true;
    });
    const usedActive = workDraft.options(glazeDraft(used), used.model, used.engine).active;
    expect(usedActive?.locationId === "glaze_load" && usedActive.options.kilnMaster).toBeNull();
    const none = ctx(DING);
    const noneActive = workDraft.options(glazeDraft(none), none.model, none.engine).active;
    expect(noneActive?.locationId === "glaze_load" && noneActive.options.kilnMaster).toBeNull();
    // No Heat marker since revision 4 (changes 28, 31).
    expect(Object.keys(options())).not.toContain("marker");
  });

  it("drops a vessel, Glaze or destination the selectors no longer offer", () => {
    const c = ctx(DING);
    let draft = glazeDraft(c);
    draft = workDraft.reduce(draft, sub({ type: "vessel", index: 0, ceramicId: "c42" }), c.model, c.engine);
    expect(draft.perLocation.glaze_load.loads[0]?.ceramicId).toBeNull();
    draft = workDraft.reduce(draft, sub({ type: "vessel", index: 0, ceramicId: "c1" }), c.model, c.engine);
    draft = workDraft.reduce(draft, sub({ type: "place", index: 0, place: "middle_3" }), c.model, c.engine);
    expect(draft.perLocation.glaze_load.loads[0]?.place).toBeNull();
  });
});

describe("Commission Market, Guild Hall, Magistrate's Hall and Canal Wharf sub-drafts", () => {
  it("has nothing to choose at placement: the Select comes first, its N and limit from commissionOptions (v1.6.2 L201–202)", () => {
    const c = ctx(INVERTED);
    for (const [key, effect, n, max] of [
      ["apprentice", "apprentice", 2, 1],
      ["shifu", "shifu", 3, 2],
      ["apprentice-senior", "shifu", 3, 2],
    ] as const) {
      const draft = work(c, { type: "place", locationId: "commission_market", workerKey: key });
      const active = workDraft.options(draft, c.model, c.engine).active;
      if (active?.locationId !== "commission_market") throw new Error(`no Commission Market for ${key}`);
      const selector = commissionOptions(c.view, effect);
      expect(active.options, key).toEqual({ n, lookCount: selector.lookCount, maxReservations: max, faceUpCount: selector.faceUpSlots.length });
      expect(selector.n).toBe(n);
      const command = workDraft.build(draft, c.model, c.engine);
      const worker = placementOptions(c.view).find((option) => option.locationId === "commission_market")?.workers.find((entry) => placementWorkerKey(entry) === key);
      expect(command, key).toEqual({ type: "PLACE_COMMISSION_MARKET", workerId: worker?.workerId, ...(key === "apprentice-senior" ? { seniorApprentice: true } : {}) });
      expect(validateAction(c.actor, command as GameAction), key).toBeNull();
      expect(command).not.toHaveProperty("first");
    }
    const [en, zh] = sentences(WINDOWS.work, work(c, { type: "place", locationId: "commission_market", workerKey: "shifu" }), c);
    // The placement's detail is the keyword, as the location summary prints it (change 25).
    expect(en).toBe("Place Shifu at Commission Market — Select 3, reserving up to 2");
    expect(zh).toBe("派师傅到瓷牙行：精选3，承接至多2张");
    const [apprentice, apprenticeZh] = sentences(WINDOWS.work, work(c, { type: "place", locationId: "commission_market", workerKey: "apprentice" }), c);
    expect(apprentice).toBe("Place Apprentice at Commission Market — Select 2");
    expect(apprenticeZh).toBe("派学徒到瓷牙行：精选2");
  });

  it("buys only a legal face-up Tech with the Apprentice at its printed cost; the Shifu inspects a discipline", () => {
    const c = ctx(INVERTED);
    const guild = guildOptions(c.view, "apprentice");
    let draft = work(c, { type: "worker", workerKey: "apprentice" }, { type: "location", locationId: "guild_hall" });
    const illegal = guild.faceUp.find((tech) => !tech.legal);
    const legal = guild.faceUp.find((tech) => tech.legal);
    if (illegal === undefined || legal === undefined) throw new Error("fixture changed");
    for (const tech of guild.faceUp) expect(tech.cost, tech.techId).toBe(TECHS[tech.techId].cost);
    draft = workDraft.reduce(draft, { type: "sub", locationId: "guild_hall", action: { type: "tech", techId: illegal.techId } }, c.model, c.engine);
    expect(draft.perLocation.guild_hall.techId).toBeNull();
    draft = workDraft.reduce(draft, { type: "sub", locationId: "guild_hall", action: { type: "tech", techId: legal.techId } }, c.model, c.engine);
    expect(workDraft.build(draft, c.model, c.engine)).toMatchObject({ type: "PLACE_GUILD_HALL", choice: { kind: "buy_face_up", techId: legal.techId } });
    let shifu = work(c, { type: "worker", workerKey: "shifu" }, { type: "location", locationId: "guild_hall" });
    const active = workDraft.options(shifu, c.model, c.engine).active;
    if (active?.locationId !== "guild_hall") throw new Error("no Guild Hall");
    expect(active.options.maxTechs).toBe(placementLimits(c.view, "guild_hall", "shifu").maxTechs);
    // No Shifu discount (owner revision 2026-10-17): the Shifu's face-up costs are printed costs too.
    for (const tech of guildOptions(c.view, "shifu").faceUp) expect(tech.cost, tech.techId).toBe(TECHS[tech.techId].cost);
    shifu = workDraft.reduce(shifu, { type: "sub", locationId: "guild_hall", action: { type: "discipline", discipline: "firing" } }, c.model, c.engine);
    expect(workDraft.build(shifu, c.model, c.engine)).toMatchObject({ choice: { kind: "inspect", discipline: "firing" } });
  });

  it("the Canal Wharf Shifu also takes the top Main Order card, unseen (v1.6.2 L219–220)", () => {
    const c = ctx(RICH);
    const shifuDraft = work(c, { type: "worker", workerKey: "shifu" }, { type: "location", locationId: "canal_wharf" });
    const apprenticeDraft = work(c, { type: "worker", workerKey: "apprentice" }, { type: "location", locationId: "canal_wharf" });
    const shifu = workDraft.options(shifuDraft, c.model, c.engine).active;
    const apprentice = workDraft.options(apprenticeDraft, c.model, c.engine).active;
    if (shifu?.locationId !== "canal_wharf" || apprentice?.locationId !== "canal_wharf") throw new Error("no Canal Wharf");
    expect(placementLimits(c.view, "canal_wharf", "shifu").topMainOrders).toBeGreaterThan(0);
    expect(shifu.options.draw).toBe("card");
    expect(apprentice.options.draw).toBeNull();
    expect(sentences(WINDOWS.work, shifuDraft, c)).toEqual(["Place Shifu at Canal Wharf — +4 Coins and the top Main Order card, unseen", "派师傅到漕运码头：得4铜钱，并不看牌面拿取主委托牌堆顶的牌"]);
    expect(sentences(WINDOWS.work, apprenticeDraft, c)).toEqual(["Place Apprentice at Canal Wharf — +2 Coins", "派学徒到漕运码头：得2铜钱"]);
  });

  it("the Canal Wharf Shifu takes no card when the Main Order deck and its discard pile are both empty (B1); still 4 Coins", () => {
    const view = structuredClone(fixture(RICH).playerView);
    view.game.counts = { ...view.game.counts, mainDeck: 0, mainDiscard: 0 };
    const c = ctxOf(view);
    const draft = work(c, { type: "worker", workerKey: "shifu" }, { type: "location", locationId: "canal_wharf" });
    const active = workDraft.options(draft, c.model, c.engine).active;
    if (active?.locationId !== "canal_wharf") throw new Error("no Canal Wharf");
    expect(commissionOptions(view, "apprentice").lookCount).toBe(0);
    expect(active.options.draw).toBe("empty");
    expect(active.options.coins).toBe(placementLimits(view, "canal_wharf", "shifu").coins);
    expect(sentences(WINDOWS.work, draft, c)[0]).toBe("Place Shifu at Canal Wharf — +4 Coins");
    // Only the discard left: it is reshuffled, so a card is still taken (L510).
    const reshuffle = structuredClone(fixture(RICH).playerView);
    reshuffle.game.counts = { ...reshuffle.game.counts, mainDeck: 0, mainDiscard: 3 };
    const r = ctxOf(reshuffle);
    const placed = workDraft.options(work(r, { type: "worker", workerKey: "shifu" }, { type: "location", locationId: "canal_wharf" }), r.model, r.engine).active;
    expect(placed?.locationId === "canal_wharf" ? placed.options.draw : null).toBe("card");
  });

  it("names the Commission Market's Select in the placement detail, and how many cards are left when the deck runs short (B1)", () => {
    const detail = (mainDeck: number, mainDiscard: number, workerKey: "shifu" | "apprentice") => {
      const view = structuredClone(fixture(RICH).playerView);
      view.game.counts = { ...view.game.counts, mainDeck, mainDiscard };
      const c = ctxOf(view);
      expect(commissionOptions(view, workerKey).lookCount).toBe(Math.min(mainDeck > 0 ? mainDeck : mainDiscard, workerKey === "shifu" ? 3 : 2));
      return sentences(WINDOWS.work, work(c, { type: "place", locationId: "commission_market", workerKey }), c);
    };
    expect(detail(1, 5, "shifu")).toEqual([
      "Place Shifu at Commission Market — Select 3, reserving up to 2 (only 1 card is left to look at)",
      "派师傅到瓷牙行：精选3，承接至多2张（只剩1张可看）",
    ]);
    expect(detail(2, 0, "shifu")[0]).toBe("Place Shifu at Commission Market — Select 3, reserving up to 2 (only 2 cards are left to look at)");
    expect(detail(0, 0, "apprentice")).toEqual(["Place Apprentice at Commission Market — Select 2 (no card is left to look at)", "派学徒到瓷牙行：精选2（没有牌可看）"]);
    // Only the discard left: it is reshuffled into a new deck as the look starts, so the look is full.
    expect(detail(0, 4, "apprentice")).toEqual(["Place Apprentice at Commission Market — Select 2", "派学徒到瓷牙行：精选2"]);
  });

  it("shows the Magistrate's Hall price and the Recognition reached from magistratesHallQuote: 4 Coins for either worker (change 33)", () => {
    const c = ctx(KM_FUEL);
    for (const key of ["shifu", "apprentice"] as const) {
      const draft = work(c, { type: "worker", workerKey: key }, { type: "location", locationId: "magistrates_hall" });
      const active = workDraft.options(draft, c.model, c.engine).active;
      if (active?.locationId !== "magistrates_hall") throw new Error("no Magistrate's Hall");
      const quote = magistratesHallQuote(c.view, key);
      expect(active.options.reachable, key).toBe(quote.reachable);
      expect(active.options.reachable, key).toBe(2);
      expect(active.options.quote.pay, key).toEqual({ clay: 0, wood: 0, coins: 4 });
      expect(workDraft.build(draft, c.model, c.engine), key).toEqual({ type: "PLACE_MAGISTRATES_HALL", workerId: `p1:${key === "shifu" ? "shifu" : "apprentice:1"}` });
    }
  });

  it("lets the Magistrate's Hall Shifu reserve 1 face-up Crown Order, optional (R21); never the Apprentice", () => {
    const c = ctx(KM_FUEL);
    let draft = work(c, { type: "worker", workerKey: "shifu" }, { type: "location", locationId: "magistrates_hall" });
    const options = (d: WorkDraft) => {
      const active = workDraft.options(d, c.model, c.engine).active;
      if (active?.locationId !== "magistrates_hall") throw new Error("no Magistrate's Hall");
      return active.options;
    };
    const slots = magistratesHallQuote(c.view, "shifu").crownOrderSlots;
    expect(options(draft).crownOrders).toEqual(slots.map((slotIndex) => ({ slotIndex, orderId: c.view.game.market.display[slotIndex] })));
    expect(options(draft).crownOrders).toEqual([
      { slotIndex: 1, orderId: "O17" },
      { slotIndex: 3, orderId: "O40" },
    ]);
    expect(options(draft).reservesCrown).toBe(true);
    // Optional: nothing is chosen, and the placement builds without it.
    expect(draft.perLocation.magistrates_hall.crownSlot).toBeNull();
    // A display position without a Crown is never taken.
    expect(workDraft.reduce(draft, { type: "sub", locationId: "magistrates_hall", action: { type: "crown", slotIndex: 0 } }, c.model, c.engine).perLocation.magistrates_hall.crownSlot).toBeNull();
    draft = workDraft.reduce(draft, { type: "sub", locationId: "magistrates_hall", action: { type: "crown", slotIndex: 3 } }, c.model, c.engine);
    const command = workDraft.build(draft, c.model, c.engine);
    expect(command).toEqual({ type: "PLACE_MAGISTRATES_HALL", workerId: "p1:shifu", crownOrder: { slotIndex: 3, orderId: "O40" } });
    expect(validateAction(c.actor, command as GameAction)).toBeNull();
    expect(workDraft.fromCommand(command!, c.model, c.engine)?.perLocation).toMatchObject({ magistrates_hall: { crownSlot: 3 } });
    const [en, zh] = sentences(WINDOWS.work, draft, c);
    expect(en).toBe("Place Shifu at Magistrate's Hall — Pay 4 Coins, then reserve O40");
    expect(zh).toBe("派师傅到州衙：付4铜钱，再承接O40");
    // Back to none.
    expect(workDraft.build(workDraft.reduce(draft, { type: "sub", locationId: "magistrates_hall", action: { type: "crown", slotIndex: null } }, c.model, c.engine), c.model, c.engine)).toEqual({ type: "PLACE_MAGISTRATES_HALL", workerId: "p1:shifu" });
    // The Apprentice reserves nothing.
    const apprentice = work(c, { type: "worker", workerKey: "apprentice" }, { type: "location", locationId: "magistrates_hall" });
    expect(options(apprentice)).toMatchObject({ crownOrders: [], reservesCrown: false });
    expect(workDraft.reduce(apprentice, { type: "sub", locationId: "magistrates_hall", action: { type: "crown", slotIndex: 3 } }, c.model, c.engine).perLocation.magistrates_hall.crownSlot).toBeNull();
  });

  it("shows the Canal Wharf's Coins from placementLimits (gap 10)", () => {
    const c = ctx(RICH);
    for (const key of ["shifu", "apprentice"] as const) {
      const draft = work(c, { type: "worker", workerKey: key }, { type: "location", locationId: "canal_wharf" });
      const active = workDraft.options(draft, c.model, c.engine).active;
      if (active?.locationId !== "canal_wharf") throw new Error("no Canal Wharf");
      expect(active.options.coins).toBe(placementLimits(c.view, "canal_wharf", key).coins);
    }
  });
});

// ── Imperial Priority and the sub-step windows ────────────────────────────────────────────

describe("selling a Flawed ceramic in the work turn (a free action, changes 30, 36)", () => {
  const SALE = "t-work-turn-sale";

  it("is a mode before the worker action, never a worker action: it builds SELL_FLAWED and the step stays", () => {
    const c = ctx(SALE);
    const options = workDraft.options(workDraft.initial(c.model, c.engine), c.model, c.engine);
    expect(options.modes.map(({ mode }) => mode)).toEqual(["place", "sell_flawed"]);
    expect(options.sale).toEqual(sellFlawedOptions(c.view));
    expect(options.sale).toEqual({ ceramicIds: ["c1"], coins: 2 });
    let draft = work(c, { type: "mode", mode: "sell_flawed" });
    expect(workDraft.options(draft, c.model, c.engine).heading).toBe("sell_flawed");
    expect(workDraft.build(draft, c.model, c.engine)).toBeNull();
    expect(sentences(WINDOWS.work, draft, c)).toEqual(["Choose a Flawed ceramic to sell.", "请选择要卖出的瑕品。"]);
    // A Standard ceramic is never offered.
    expect(workDraft.reduce(draft, { type: "sell", ceramicId: "c2" }, c.model, c.engine)).toBe(draft);
    draft = workDraft.reduce(draft, { type: "sell", ceramicId: "c1" }, c.model, c.engine);
    const command = workDraft.build(draft, c.model, c.engine);
    expect(command).toEqual({ type: "SELL_FLAWED", ceramicId: "c1" });
    expect(validateAction(c.actor, command as GameAction)).toBeNull();
    expect(workDraft.fromCommand(command!, c.model, c.engine)).toMatchObject({ mode: "sell_flawed", sell: "c1" });
    expect(sentences(WINDOWS.work, draft, c)).toEqual(["Sell Celadon Vase, Painted · Flawed for 2 Coins", "卖出青釉瓶 · 画花 · 瑕品，得2铜钱"]);
    // Back to placing drops the sale.
    expect(work(c, { type: "sell", ceramicId: "c1" }, { type: "mode", mode: "place" }).sell).toBeNull();
  });

  it("is offered by the hidden pane's openers and the table's Sell buttons; never when there is nothing to sell", () => {
    const c = ctx(SALE);
    const draft = workDraft.initial(c.model, c.engine);
    const pane = WINDOWS.work.pane?.(draft, c.model, c.engine);
    expect(pane?.hidden).toBe(true);
    expect(pane?.hidden === true ? pane.openers.map((opener) => opener.key) : []).toEqual(["sell_flawed"]);
    const table = WINDOWS.work.table!;
    expect([...table.select(draft, c.model, c.engine).sellTargets]).toEqual([["c1", { pressed: false }]]);
    const action = table.act(draft, { type: "sell", ceramicId: "c1" }, c.model, c.engine);
    expect(action).toEqual({ type: "sell", ceramicId: "c1" });
    const chosen = workDraft.reduce(draft, action as WorkAction, c.model, c.engine);
    expect([...table.select(chosen, c.model, c.engine).sellTargets]).toEqual([["c1", { pressed: true }]]);
    expect(WINDOWS.work.pane?.(chosen, c.model, c.engine).hidden).toBe(false);
    // No Flawed ceramic: no mode, no target.
    const none = ctx("m1_work_phase_r2_3p");
    expect(sellFlawedOptions(none.view)).toBeNull();
    const plain = workDraft.initial(none.model, none.engine);
    expect(workDraft.options(plain, none.model, none.engine).modes.map(({ mode }) => mode)).not.toContain("sell_flawed");
    expect(table.select(plain, none.model, none.engine).sellTargets.size).toBe(0);
    expect(table.act(plain, { type: "sell", ceramicId: "c1" }, none.model, none.engine)).toBeNull();
  });

  it("is offered after the worker action too, beside End turn", () => {
    const c = ctxWith(SALE, (view) => {
      view.game.phase = { type: "work_turn", activePlayerId: view.viewerId!, step: { kind: "after_action" } };
    });
    expect(workDraft.options(workDraft.initial(c.model, c.engine), c.model, c.engine).modes.map(({ mode }) => mode)).toEqual(["sell_flawed", "end_turn"]);
    const draft = work(c, { type: "sell", ceramicId: "c1" });
    expect(workDraft.build(draft, c.model, c.engine)).toEqual({ type: "SELL_FLAWED", ceramicId: "c1" });
    expect(WINDOWS.work.alternative?.(draft, c.model, c.engine)?.command).toEqual({ type: "END_TURN" });
  });
});

describe("completing a held Order in the work turn (a free action, owner revision 5, change 36)", () => {
  it("before the worker action: one Deliver chip per completable held Order; it opens the completion with that Order chosen", () => {
    const c = ctx(DING);
    const draft = workDraft.initial(c.model, c.engine);
    const pane = WINDOWS.work.pane?.(draft, c.model, c.engine);
    expect(pane?.hidden).toBe(true);
    const openers = pane?.hidden === true ? pane.openers : [];
    expect(openers.map((opener) => opener.key)).toEqual(["complete-O01", "complete-S01", "imperial_priority", "colour_samples_swap"]);
    const opener = openers.find((candidate) => candidate.key === "complete-O01")!;
    expect(EN.message(opener.label as never)).toBe("Deliver O01");
    expect(ZH.message(opener.label as never)).toBe("交付O01");
    const opened = workDraft.reduce(draft, opener.action as WorkAction, c.model, c.engine);
    expect(opened.mode).toBe("complete_order");
    expect(opened.completion.orderId).toBe("O01");
    expect(WINDOWS.work.pane?.(opened, c.model, c.engine).hidden).toBe(false);
    expect(workDraft.options(opened, c.model, c.engine).heading).toBe("complete_order");
  });

  it("builds COMPLETE_ORDER from the shared completion model, which the engine accepts before the action, and round-trips it", () => {
    const c = ctx(DING);
    const draft = work(c, { type: "complete", action: { type: "order", orderId: "O01" } });
    const command = workDraft.build(draft, c.model, c.engine);
    expect(command).toMatchObject({ type: "COMPLETE_ORDER", orderId: "O01" });
    expect(validateAction(c.actor, command as GameAction)).toBeNull();
    expect(workDraft.fromCommand(command!, c.model, c.engine)).toMatchObject({ mode: "complete_order", completion: { orderId: "O01" } });
    const [en, zh] = sentences(WINDOWS.work, draft, c);
    expect(en).toMatch(/^Complete O01 with /);
    expect(zh).toMatch(/完成O01$/);
    // Nothing chosen yet: the sentence asks for an Order.
    expect(sentences(WINDOWS.work, work(c, { type: "mode", mode: "complete_order" }), c)).toEqual(["Choose an Order to complete.", "请选择要完成的委托。"]);
    // Back to placing drops it.
    expect(work(c, { type: "complete", action: { type: "order", orderId: "O01" } }, { type: "mode", mode: "place" }).completion.orderId).toBeNull();
  });

  it("the table: completable held Orders are choices on the hand row; with the completion open, the rest show blocked and the group is highlighted", () => {
    const c = ctx(DING);
    const table = WINDOWS.work.table!;
    const placing = workDraft.initial(c.model, c.engine);
    const targets = (draft: WorkDraft) => Object.fromEntries([...table.select(draft, c.model, c.engine).orderTargets].map(([key, target]) => [key, target.state]));
    expect(targets(placing)).toEqual({ O01: "completable", S01: "completable" });
    const action = table.act(placing, { type: "order", key: "S01" }, c.model, c.engine);
    expect(action).toEqual({ type: "complete", action: { type: "order", orderId: "S01" } });
    const open = workDraft.reduce(placing, action as WorkAction, c.model, c.engine);
    expect(targets(open)).toEqual({ O01: "completable", S01: "chosen" });
    expect([...table.select(open, c.model, c.engine).highlightedCeramicIds]).toEqual(open.completion.ceramicIds);
    // The Colour Samples swap's discard choice takes the hand row while it is open.
    const swap = work(c, { type: "mode", mode: "colour_samples_swap" });
    expect(Object.values(targets(swap))).toEqual(["choosable", "choosable"]);
    // No completable Order: no target.
    const plain = ctx("m1_work_phase_r2_3p");
    expect(table.select(workDraft.initial(plain.model, plain.engine), plain.model, plain.engine).orderTargets.size).toBe(0);
  });

  it("after the worker action: a mode beside End turn; the engine accepts the completion (R27)", () => {
    const c = ctx("w-after-the-worker-action");
    const draft = work(c, { type: "complete", action: { type: "order", orderId: "O01" } });
    const command = workDraft.build(draft, c.model, c.engine);
    expect(command).toMatchObject({ type: "COMPLETE_ORDER", orderId: "O01" });
    expect(validateAction(c.actor, command as GameAction)).toBeNull();
    expect(WINDOWS.work.alternative?.(draft, c.model, c.engine)?.command).toEqual({ type: "END_TURN" });
  });
});

describe("Imperial Priority draft (gap 16)", () => {
  it("lists vessels, Glazes, modifiers and rework Shapes from imperialPriorityOptions and builds the command", () => {
    const c = ctx(DING);
    const selector = imperialPriorityOptions(c.view);
    let draft = imperialPriorityDraft.initial(c.model, c.engine);
    expect(draft.ceramicId).toBeNull();
    draft = imperialPriorityDraft.reduce(draft, { type: "vessel", ceramicId: "c2" }, c.model, c.engine);
    const options = imperialPriorityDraft.options(draft, c.model, c.engine);
    const chosen = selector.ceramics.find((ceramic) => ceramic.ceramicId === "c2");
    expect(options.vessels.map((vessel) => vessel.ceramicId)).toEqual(selector.ceramicIds);
    expect(options.glazes).toEqual(chosen?.glazes);
    expect(options.modifiers).toEqual(chosen?.imperialModifiers);
    expect(options.reworkShapes).toEqual(chosen?.reworkShapes);
    for (const action of [
      { type: "glaze", glaze: "moon_white" },
      { type: "modifier", modifier: -1 },
      { type: "rework", shape: "vase" },
    ] as const) draft = imperialPriorityDraft.reduce(draft, action, c.model, c.engine);
    const command = imperialPriorityDraft.build(draft, c.model, c.engine);
    expect(command).toEqual({ type: "USE_IMPERIAL_PRIORITY", ceramicId: "c2", glaze: "moon_white", imperialModifier: -1, reworkShape: "vase" });
    expect(validateAction(c.actor, command as GameAction)).toBeNull();
    draft = imperialPriorityDraft.reduce(draft, { type: "rework", shape: "plate" }, c.model, c.engine);
    expect(draft.rework).toBe("plate");
    const work = workDraft.reduce(workDraft.initial(c.model, c.engine), { type: "imperialPriority", action: { type: "vessel", ceramicId: "c2" } }, c.model, c.engine);
    expect(work.mode).toBe("imperial_priority");
    // Without Kiln Master there is no marker to place; Imperial Priority costs no Wood (rev. 4 L291).
    expect(options.kilnMaster).toBeNull();
  });

  it("offers no Kiln Master's marker while its one marker waits with a ceramic in a kiln (P7, R28)", () => {
    // Kiln Master's owner, with its marker on a Shaped vessel made a loaded ceramic: what Imperial
    // Priority in an Order Phase leaves behind, carried into the next round with the Tech ready again.
    const c = ctxWith(KM_FUEL, (view) => {
      const me = view.viewerId as string;
      const shaped = Object.values(view.game.ceramics).find((ceramic) => ceramic.ownerId === me && ceramic.stage === "shaped");
      if (shaped === undefined) throw new Error("no Shaped vessel");
      const waiting = { ...shaped, stage: "loaded", glaze: "white", loadedInRound: view.game.round, loadedBy: "imperial_priority", placement: { kiln: "imperial", modifier: 0 }, kilnMasterMarker: 1 };
      (view.game.ceramics as Record<string, unknown>)[shaped.id] = waiting;
    });
    expect(kilnMasterOption(c.view, c.actor.viewerId)?.ready).toBe(false);
    expect(imperialPriorityOptions(c.view).kilnMaster).toBe(false);
    const active = workDraft.options(work(c, { type: "worker", workerKey: "shifu" }, { type: "location", locationId: "glaze_load" }), c.model, c.engine).active;
    expect(active?.locationId === "glaze_load" && active.options.kilnMaster).toBeNull();
  });

  it("places Kiln Master's marker with Imperial Priority when it is ready (R22: any loading)", () => {
    // The same choice with Kiln Master (T24) as the viewer's Firing Tech instead of Second Firing.
    const c = ctxWith(DING, (view) => {
      viewer(view).techs = viewer(view).techs.map((tech) => (tech.id === "T14" ? { ...tech, id: "T24" as const, usedThisRound: false } : tech));
    });
    expect(imperialPriorityOptions(c.view).kilnMaster).toBe(true);
    let draft = imperialPriorityDraft.initial(c.model, c.engine);
    for (const action of [
      { type: "vessel", ceramicId: "c2" },
      { type: "glaze", glaze: "white" },
      { type: "modifier", modifier: 0 },
    ] as const) draft = imperialPriorityDraft.reduce(draft, action, c.model, c.engine);
    expect(imperialPriorityDraft.options(draft, c.model, c.engine).kilnMaster).toEqual({ techId: "T24", values: [1, -1] });
    expect(draft.kilnMaster).toBeNull();
    draft = imperialPriorityDraft.reduce(draft, { type: "kilnMaster", value: 1 }, c.model, c.engine);
    const command = imperialPriorityDraft.build(draft, c.model, c.engine);
    expect(command).toEqual({ type: "USE_IMPERIAL_PRIORITY", ceramicId: "c2", glaze: "white", imperialModifier: 0, kilnMaster: 1 });
    expect(validateAction(c.actor, command as GameAction)).toBeNull();
    expect(imperialPriorityDraft.fromCommand(command!, c.model, c.engine)).toEqual(draft);
    expect(sentences(WINDOWS.work, workDraft.fromCommand(command!, c.model, c.engine), c)[0]).toMatch(/; Kiln Master marker \+1$/);
    // Used this round: the choice is dropped.
    const used = ctxWith(DING, (view) => {
      viewer(view).techs = viewer(view).techs.map((tech) => (tech.id === "T14" ? { ...tech, id: "T24" as const, usedThisRound: true } : tech));
    });
    expect(imperialPriorityDraft.reduce(draft, REVALIDATE, used.model, used.engine).kilnMaster).toBeNull();
  });
});

describe("Commission Market reservation step: its Select (v1.6.2 L64, L197–205, change 25)", () => {
  const SHIFU = "w-commission-market-shifu-top-3-look-2-reservations";
  const APPRENTICE = "w-commission-market-apprentice-top-2-look-1-reservation";

  it("the Shifu effect reserves 1 or 2, from the display and the looked cards in any mix, in canonical order", () => {
    const c = ctx(SHIFU);
    const look = lookedOrderOptions(c.view);
    if (look === null) throw new Error("no look");
    let draft = selectDraft.initial(c.model, c.engine);
    const options = selectDraft.options(draft, c.model, c.engine);
    expect(options.maxReservations).toBe(2);
    expect(options.looked.map((choice) => choice.orderId)).toEqual(look.orderIds);
    expect(options.slots.map((choice) => choice.slotIndex)).toEqual(look.faceUpSlots);
    expect(draft.picks).toEqual([]);
    expect(selectDraft.build(draft, c.model, c.engine)).toBeNull();
    expect(sentences(WINDOWS.commission, draft, c)).toEqual(["Choose up to 2 Orders to reserve.", "请选择要承接的委托（至多2张）。"]);
    expect(WINDOWS.commission.alternative?.(draft, c.model, c.engine) ?? null).toBeNull();
    const looked = at(look.orderIds, 2);
    draft = selectDraft.reduce(draft, { type: "toggle", key: lookPickKey(looked), on: true }, c.model, c.engine);
    draft = selectDraft.reduce(draft, { type: "toggle", key: slotPickKey(1), on: true }, c.model, c.engine);
    // A third pick is ignored; an Order not offered is ignored.
    expect(selectDraft.reduce(draft, { type: "toggle", key: slotPickKey(0), on: true }, c.model, c.engine)).toBe(draft);
    expect(selectDraft.options(draft, c.model, c.engine).full).toBe(true);
    const command = selectDraft.build(draft, c.model, c.engine);
    expect(command).toEqual({
      type: "SELECT_CHOOSE",
      reservations: [
        { kind: "face_up", slotIndex: 1, orderId: c.view.game.market.display[1] },
        { kind: "looked", orderId: looked },
      ],
    });
    expect(validateAction(c.actor, command as GameAction)).toBeNull();
    const [en, zh] = sentences(WINDOWS.commission, draft, c);
    // R25: the looked cards not reserved are discarded.
    expect(en).toBe(`Reserve ${c.view.game.market.display[1]} and ${looked}; discard the other 2 cards you looked at`);
    expect(zh).toBe(`承接${c.view.game.market.display[1]}与${looked}，弃置看过的另2张`);
    expect(selectDraft.fromCommand(command!, c.model, c.engine)).toEqual({ picks: [slotPickKey(1), lookPickKey(looked)] });
    // Unticking one leaves a single, still legal reservation.
    const one = selectDraft.reduce(draft, { type: "toggle", key: slotPickKey(1), on: false }, c.model, c.engine);
    expect(selectDraft.build(one, c.model, c.engine)).toEqual({ type: "SELECT_CHOOSE", reservations: [{ kind: "looked", orderId: looked }] });
    expect(selectDraft.reduce(one, REVALIDATE, c.model, c.engine)).toBe(one);
  });

  it("the Apprentice effect reserves exactly 1, a looked card or a display Order", () => {
    const c = ctx(APPRENTICE);
    const look = lookedOrderOptions(c.view);
    if (look === null) throw new Error("no look");
    expect(look.maxReservations).toBe(1);
    let draft = selectDraft.initial(c.model, c.engine);
    draft = selectDraft.reduce(draft, { type: "pick", key: lookPickKey(at(look.orderIds, 0)) }, c.model, c.engine);
    draft = selectDraft.reduce(draft, { type: "pick", key: slotPickKey(3) }, c.model, c.engine);
    expect(draft.picks).toEqual([slotPickKey(3)]);
    // A checkbox-style toggle replaces the pick too: the limit is 1.
    draft = selectDraft.reduce(draft, { type: "toggle", key: lookPickKey(at(look.orderIds, 1)), on: true }, c.model, c.engine);
    expect(draft.picks).toEqual([lookPickKey(at(look.orderIds, 1))]);
    const command = selectDraft.build(draft, c.model, c.engine);
    expect(command).toEqual({ type: "SELECT_CHOOSE", reservations: [{ kind: "looked", orderId: look.orderIds[1] }] });
    expect(validateAction(c.actor, command as GameAction)).toBeNull();
    expect(sentences(WINDOWS.commission, draft, c)).toEqual([`Reserve ${look.orderIds[1]}; discard the 1 other card you looked at`, `承接${look.orderIds[1]}，弃置看过的另1张`]);
    // A display Order leaves every looked card to be discarded: no "other" (另) card then.
    const faceUp = selectDraft.reduce(draft, { type: "pick", key: slotPickKey(0) }, c.model, c.engine);
    expect(sentences(WINDOWS.commission, faceUp, c)).toEqual([
      `Reserve ${c.view.game.market.display[0]}; discard the 2 cards you looked at`,
      `承接${c.view.game.market.display[0]}，弃置看过的2张`,
    ]);
    // Two picks are not expressible for the Apprentice effect.
    expect(
      selectDraft.fromCommand({ type: "SELECT_CHOOSE", reservations: [{ kind: "looked", orderId: at(look.orderIds, 0) }, { kind: "looked", orderId: at(look.orderIds, 1) }] }, c.model, c.engine),
    ).toBeNull();
  });

  it("a stale face-up pick is dropped when the display position no longer holds its Order", () => {
    const c = ctx(SHIFU);
    const draft = selectDraft.reduce(selectDraft.initial(c.model, c.engine), { type: "toggle", key: slotPickKey(4), on: true }, c.model, c.engine);
    const changed = ctxWith(SHIFU, (view) => {
      view.game.market.display[4] = null;
    });
    expect(selectDraft.reduce(draft, REVALIDATE, changed.model, changed.engine).picks).toEqual([]);
    expect(selectDraft.fromCommand({ type: "SELECT_CHOOSE", reservations: [{ kind: "face_up", slotIndex: 4, orderId: "O99" as OrderId }] }, c.model, c.engine)).toBeNull();
  });

  it("m2: the played Shifu look offers its 3 cards and the Orders showing now", () => {
    const c = ctx("m2_commission_market_look_r3_4p");
    const look = lookedOrderOptions(c.view);
    if (look === null) throw new Error("no look");
    const options = selectDraft.options(selectDraft.initial(c.model, c.engine), c.model, c.engine);
    expect(options.looked.map((choice) => choice.orderId)).toEqual(look.orderIds);
    expect(options.slots.map((choice) => choice.slotIndex)).toEqual(look.faceUpSlots);
    expect(options.maxReservations).toBe(2);
  });
});

describe("Guild Hall inspection (v1.6.2 L206–213, owner revision 2026-10-17)", () => {
  it("takes one Tech per command at its printed cost; nothing to finish before the first take", () => {
    const c = ctx("m12_guild_shifu_inspection");
    const options = guildInspectionOptions(c.view);
    if (options === null) throw new Error("no inspection");
    const inspected = options.inspected.map((option) => option.techId);
    let draft = guildInspectionDraft.initial(c.model, c.engine);
    expect(draft).toEqual({ choice: null, bottomOrder: inspected });
    expect(options.canFinish).toBe(false);
    expect(options.takesLeft).toBe(2);
    expect(guildInspectionDraft.build(draft, c.model, c.engine)).toBeNull();
    // Finishing is not offered before a take (TECH_TAKE_REQUIRED).
    expect(guildInspectionDraft.reduce(draft, { type: "finish" }, c.model, c.engine).choice).toBeNull();
    for (const option of [...options.inspected, ...options.faceUp]) expect(option.cost, option.techId).toBe(TECHS[option.techId].cost);
    const take = [...options.inspected, ...options.faceUp].find((option) => option.legal);
    if (take === undefined) throw new Error("no legal take");
    draft = guildInspectionDraft.reduce(draft, { type: "take", take: { kind: take.source, techId: take.techId } }, c.model, c.engine);
    const command = guildInspectionDraft.build(draft, c.model, c.engine);
    expect(command).toEqual({ type: "GUILD_TAKE", take: { kind: take.source, techId: take.techId } });
    expect(command).not.toHaveProperty("bottomOrder");
    expect(validateAction(c.actor, command as GameAction)).toBeNull();
    expect(guildInspectionDraft.reduce(draft, { type: "reorder", bottomOrder: ["T99" as never] }, c.model, c.engine)).toBe(draft);
  });

  it("after a take: a second Tech of another discipline, or stop with the untaken Techs in a chosen bottom order", () => {
    // One take made: the inspection is open again (the engine's step lists the take).
    const c = ctxWith("w-guild-hall-shifu-inspection", (view) => {
      const phase = view.game.phase;
      if (phase.type !== "work_turn" || phase.step.kind !== "guild_inspection") throw new Error("fixture changed");
      const techId = view.game.techDisplay.glazing_loading[0];
      if (techId === undefined) throw new Error("no glazing Tech");
      view.game.techDisplay.glazing_loading = view.game.techDisplay.glazing_loading.slice(1);
      phase.step = { ...phase.step, takes: [{ kind: "face_up", techId }] };
      viewer(view).techs = [...viewer(view).techs, { id: techId, acquiredInRound: view.game.round, usedThisRound: false }];
    });
    const options = guildInspectionOptions(c.view);
    if (options === null) throw new Error("no inspection");
    expect(options.canFinish).toBe(true);
    expect(options.takesLeft).toBe(1);
    expect(guildInspectionDraft.summary(guildInspectionDraft.initial(c.model, c.engine), c.model, c.engine)?.key).toBe("work.gi.summaryChooseOrFinish");
    let draft = guildInspectionDraft.reduce(guildInspectionDraft.initial(c.model, c.engine), { type: "finish" }, c.model, c.engine);
    const inspected = options.inspected.map((option) => option.techId);
    expect(draft).toEqual({ choice: { kind: "finish" }, bottomOrder: inspected });
    const reversed = [...inspected].reverse();
    draft = guildInspectionDraft.reduce(draft, { type: "reorder", bottomOrder: reversed }, c.model, c.engine);
    const finish = guildInspectionDraft.build(draft, c.model, c.engine);
    expect(finish).toEqual({ type: "GUILD_FINISH", bottomOrder: reversed });
    expect(validateAction(c.actor, finish as GameAction)).toBeNull();
    expect(guildInspectionDraft.fromCommand(finish!, c.model, c.engine)).toEqual(draft);
    const [en] = sentences(WINDOWS.guild_inspection, draft, c);
    expect(en).toBe("Take no more Techs; put the rest on the bottom of the Firing deck");
    // A second take of the first take's discipline is refused by the engine and not offered.
    const same = options.faceUp.find((option) => TECHS[option.techId].discipline === "glazing_loading");
    if (same !== undefined) {
      expect(same.legal).toBe(false);
      expect(guildInspectionDraft.reduce(draft, { type: "take", take: { kind: "face_up", techId: same.techId } }, c.model, c.engine).choice).toEqual({ kind: "finish" });
    }
    const second = options.inspected.find((option) => option.legal);
    if (second === undefined) throw new Error("no legal second take");
    const taking = guildInspectionDraft.reduce(draft, { type: "take", take: { kind: "inspected", techId: second.techId } }, c.model, c.engine);
    expect(guildInspectionDraft.build(taking, c.model, c.engine)).toEqual({ type: "GUILD_TAKE", take: { kind: "inspected", techId: second.techId } });
    expect(WINDOWS.guild_inspection.title(c.model, c.engine, taking)).toEqual({ key: "work.title.guildSecond" });
    expect(GUILD_FINISH_VALUE).toBe("finish");
  });

  it("with no Tech left to take, stopping is pre-selected", () => {
    const c = ctxWith("w-guild-hall-shifu-inspection", (view) => {
      const phase = view.game.phase;
      if (phase.type !== "work_turn" || phase.step.kind !== "guild_inspection") throw new Error("fixture changed");
      phase.step = { ...phase.step, takes: [{ kind: "face_up", techId: "T10" }, { kind: "face_up", techId: "T16" }] };
      view.game.techDisplay.glazing_loading = view.game.techDisplay.glazing_loading.filter((id) => id !== "T10");
      view.game.techDisplay.workshop = view.game.techDisplay.workshop.filter((id) => id !== "T16");
      viewer(view).techs = [...viewer(view).techs.filter((tech) => tech.id !== "T01"), { id: "T10", acquiredInRound: 1, usedThisRound: false }, { id: "T16", acquiredInRound: 1, usedThisRound: false }];
    });
    const options = guildInspectionOptions(c.view);
    expect(options?.takesLeft).toBe(0);
    const draft = guildInspectionDraft.initial(c.model, c.engine);
    expect(draft.choice).toEqual({ kind: "finish" });
    expect(guildInspectionDraft.build(draft, c.model, c.engine)).toEqual({ type: "GUILD_FINISH", bottomOrder: options?.inspected.map((option) => option.techId) });
    // Both takes made: only the bottom order is left, so the window says so and the table offers nothing.
    expect(inspectionReturnOnly(options!)).toBe(true);
    expect(WINDOWS.guild_inspection.title(c.model, c.engine, draft)).toEqual({ key: "work.title.guildReturn" });
    expect(guildInspectionDraft.summary(draft, c.model, c.engine)?.key).toBe("work.gi.summaryReturn");
    expect(inspectionTechChooser(draft, c.model, c.engine)).toBeNull();
  });

  it("ignores a Tech the engine says cannot be taken", () => {
    const c = ctx("w-guild-hall-shifu-inspection");
    const options = guildInspectionOptions(c.view);
    const illegal = options?.faceUp.find((option) => !option.legal);
    if (illegal === undefined) throw new Error("fixture changed: every face-up Tech is legal");
    const draft = guildInspectionDraft.reduce(guildInspectionDraft.initial(c.model, c.engine), { type: "take", take: { kind: "face_up", techId: illegal.techId } }, c.model, c.engine);
    expect(draft.choice).toBeNull();
  });
});

describe("Colour Samples, Kiln selection and Setter's Mark", () => {
  it("Colour Samples' Select 3 reserves 1: a looked card or a face-up Order (v1.6.2 L64, L622, change 25)", () => {
    for (const [id, kind] of [
      ["m16_colour_samples", "colour_samples"],
      ["w-colour-samples-choice", "colour_samples"],
      ["m20_colour_samples_swap_look", "colour_samples_swap"],
      ["w-colour-samples-swap-look", "colour_samples_swap"],
    ] as const) {
      const c = ctx(id);
      const look = lookedOrderOptions(c.view);
      expect(look?.kind, id).toBe(kind);
      if (look === null) throw new Error(id);
      expect([look.n, look.maxReservations], id).toEqual([3, 1]);
      const options = selectDraft.options(selectDraft.initial(c.model, c.engine), c.model, c.engine);
      expect(options.kind, id).toBe(kind);
      expect(options.n, id).toBe(3);
      expect(options.looked.map((choice) => choice.orderId), id).toEqual(look.orderIds);
      expect(options.slots.map((choice) => choice.slotIndex), id).toEqual(look.faceUpSlots);
      expect(look.faceUpSlots.length, `${id}: the display offers Orders`).toBeGreaterThan(0);
      // A looked card: the other 2 are discarded (R25).
      const lookedPick = selectDraft.reduce(selectDraft.initial(c.model, c.engine), { type: "pick", key: lookPickKey(at(look.orderIds, 0)) }, c.model, c.engine);
      const lookedCommand = selectDraft.build(lookedPick, c.model, c.engine);
      expect(lookedCommand, id).toEqual({ type: "SELECT_CHOOSE", reservations: [{ kind: "looked", orderId: look.orderIds[0] }] });
      expect(validateAction(c.actor, lookedCommand as GameAction), id).toBeNull();
      expect(sentences(WINDOWS[kind], lookedPick, c), id).toEqual([
        `Reserve ${look.orderIds[0]}; discard the other 2 cards you looked at`,
        `承接${look.orderIds[0]}，弃置看过的另2张`,
      ]);
      // A face-up Order instead: all 3 looked cards are discarded; a second pick replaces it (limit 1).
      const slot = at(look.faceUpSlots, 0);
      const faceUp = selectDraft.reduce(lookedPick, { type: "pick", key: slotPickKey(slot) }, c.model, c.engine);
      expect(faceUp.picks, id).toEqual([slotPickKey(slot)]);
      const faceUpCommand = selectDraft.build(faceUp, c.model, c.engine);
      expect(faceUpCommand, id).toEqual({ type: "SELECT_CHOOSE", reservations: [{ kind: "face_up", slotIndex: slot, orderId: c.view.game.market.display[slot] }] });
      expect(validateAction(c.actor, faceUpCommand as GameAction), id).toBeNull();
      expect(sentences(WINDOWS[kind], faceUp, c), id).toEqual([
        `Reserve ${c.view.game.market.display[slot]}; discard the 3 cards you looked at`,
        `承接${c.view.game.market.display[slot]}，弃置看过的3张`,
      ]);
      expect(selectDraft.fromCommand(faceUpCommand!, c.model, c.engine), id).toEqual({ picks: [slotPickKey(slot)] });
      // Two reservations are not expressible here.
      expect(selectDraft.fromCommand({ type: "SELECT_CHOOSE", reservations: [{ kind: "looked", orderId: at(look.orderIds, 0) }, { kind: "face_up", slotIndex: slot, orderId: c.view.game.market.display[slot]! }] }, c.model, c.engine), id).toBeNull();
      expect(WINDOWS[kind].alternative?.(faceUp, c.model, c.engine) ?? null, id).toBeNull();
    }
  });

  it("Colour Samples' Select with no card to look at reserves from the display (B1)", () => {
    const c = ctxWith("w-colour-samples-choice", (view) => {
      const phase = view.game.phase;
      const look = view.own?.pendingLook;
      if (phase.type !== "work_turn" || phase.step.kind !== "colour_samples" || look?.kind !== "colour_samples") throw new Error("fixture changed");
      look.orderIds = [];
      phase.step = { ...phase.step, select: { ...phase.step.select, lookedCount: 0 } };
    });
    const options = selectDraft.options(selectDraft.initial(c.model, c.engine), c.model, c.engine);
    expect(options.looked).toEqual([]);
    expect(options.short).toBe(false);
    expect(options.slots.length).toBeGreaterThan(0);
    const draft = selectDraft.reduce(selectDraft.initial(c.model, c.engine), { type: "pick", key: slotPickKey(at(options.slots, 0).slotIndex!) }, c.model, c.engine);
    expect(sentences(WINDOWS.colour_samples, draft, c)).toEqual([`Reserve ${at(options.slots, 0).orderId}`, `承接${at(options.slots, 0).orderId}`]);
  });

  it("offers every available Kiln from setupChoiceOptions and never a taken one; one turn takes a Kiln and a face-up Main Order (rev. 4 L122, R23)", () => {
    const view = structuredClone(fixture("m15_kiln_selection").playerView);
    const other = view.game.playerOrder.find((pid) => pid !== view.viewerId);
    const otherPlayer = other === undefined ? undefined : view.game.players[other];
    if (otherPlayer === undefined) throw new Error("no other player");
    otherPlayer.kilnId = "JU";
    const c = ctxOf(view);
    const choice = setupChoiceOptions(view);
    if (choice === null) throw new Error("not the viewer's choice");
    const options = kilnSelectionDraft.options(kilnSelectionDraft.initial(c.model, c.engine), c.model, c.engine);
    expect(options.kilns).toEqual(choice.kilns);
    expect(options.kilns).toEqual(kilnSelectionOptions(view));
    expect(options.kilns.find((kiln) => kiln.kilnId === "JU")).toMatchObject({ available: false, chosenBy: other });
    expect(options.orders).toEqual(choice.faceUpSlots.map((slotIndex) => ({ slotIndex, orderId: view.game.market.display[slotIndex] })));
    expect(options.orders).toHaveLength(6);
    const draft = kilnSelectionDraft.initial(c.model, c.engine);
    expect(draft).toEqual({ kilnId: null, slotIndex: null });
    expect(kilnSelectionDraft.reduce(draft, { type: "kiln", kilnId: "JU" }, c.model, c.engine).kilnId).toBeNull();
    expect(kilnSelectionDraft.reduce(draft, { type: "order", slotIndex: 9 }, c.model, c.engine).slotIndex).toBeNull();
    for (const kilnId of ["RU", "GU", "GE", "DI"] as KilnId[]) {
      const chosen = kilnSelectionDraft.reduce(draft, { type: "kiln", kilnId }, c.model, c.engine);
      // The Main Order is not optional: no command until one is chosen.
      expect(kilnSelectionDraft.build(chosen, c.model, c.engine)).toBeNull();
      expect(EN.message(kilnSelectionDraft.summary(chosen, c.model, c.engine)!)).toMatch(/now choose a Main Order from the display/);
      const both = kilnSelectionDraft.reduce(chosen, { type: "order", slotIndex: 2 }, c.model, c.engine);
      const command = kilnSelectionDraft.build(both, c.model, c.engine);
      expect(command).toEqual({ type: "SELECT_KILN", kilnId, mainOrder: { slotIndex: 2, orderId: view.game.market.display[2] } });
      expect(validateAction(c.actor, command as GameAction)).toBeNull();
      expect(kilnSelectionDraft.fromCommand(command!, c.model, c.engine)).toEqual({ kilnId, slotIndex: 2 });
    }
    const both = kilnSelectionDraft.reduce(kilnSelectionDraft.reduce(draft, { type: "kiln", kilnId: "GE" }, c.model, c.engine), { type: "order", slotIndex: 0 }, c.model, c.engine);
    const order = view.game.market.display[0];
    expect(sentences(WINDOWS.kiln_selection, both, c)).toEqual([`Take the Ge Kiln and ${order}`, `选择哥窑，拿取${order}`]);
    // A stale display position (refilled since) is dropped.
    const changed = ctxWith("m15_kiln_selection", (edited) => {
      edited.game.market.display[0] = null;
    });
    expect(kilnSelectionDraft.reduce(both, REVALIDATE, changed.model, changed.engine).slotIndex).toBeNull();
    // The display's Choose toggles choose the same Main Order.
    const table = WINDOWS.kiln_selection.table!;
    expect([...table.select(draft, c.model, c.engine).orderTargets.keys()]).toEqual(choice.faceUpSlots.map((slotIndex) => `slot:${String(slotIndex)}`));
    expect(table.act(draft, { type: "order", key: "slot:4" }, c.model, c.engine)).toEqual({ type: "order", slotIndex: 4 });
    expect(table.select(both, c.model, c.engine).orderTargets.get("slot:0")?.state).toBe("chosen");
  });

  it("places the Setter's Mark on a settersMarkOptions space, or declines", () => {
    const c = ctx("m10a_setters_mark_window");
    const spaces = settersMarkOptions(c.view);
    const draft = settersMarkDraft.initial(c.model, c.engine);
    expect(settersMarkDraft.options(draft, c.model, c.engine).spaces.map((space) => space.spaceId)).toEqual(spaces);
    expect(settersMarkDraft.build(draft, c.model, c.engine)).toBeNull();
    const declined = settersMarkDraft.reduce(draft, { type: "choose", choice: "decline" }, c.model, c.engine);
    expect(settersMarkDraft.build(declined, c.model, c.engine)).toEqual({ type: "PLACE_SETTERS_MARK", spaceId: null });
    expect(WINDOWS.setters_mark.alternative?.(draft, c.model, c.engine)?.command).toEqual({ type: "PLACE_SETTERS_MARK", spaceId: null });
    const placed = settersMarkDraft.reduce(draft, { type: "choose", choice: spaces[0] ?? "high_1" }, c.model, c.engine);
    expect(settersMarkDraft.build(placed, c.model, c.engine)).toEqual({ type: "PLACE_SETTERS_MARK", spaceId: spaces[0] });
    expect(sentences(WINDOWS.setters_mark, placed, c)[0]).toMatch(/^Place your Setter’s Mark on /);
  });
});

// ── Table adapters (§3.5) ─────────────────────────────────────────────────────────────────

describe("table adapters", () => {
  it("work: Place shortcuts for every legal worker entry; a shortcut sets worker and location", () => {
    const c = ctx(INVERTED);
    const adapter = WINDOWS.work.table;
    if (adapter === undefined) throw new Error("no adapter");
    const draft = workDraft.initial(c.model, c.engine);
    const selection = adapter.select(draft, c.model, c.engine);
    // Every entry, legal or not (CR B2-3); the table draws Place for the legal ones only.
    for (const option of placementOptions(c.view)) expect(selection.placeTargets.get(option.locationId) ?? []).toEqual(option.workers);
    const action = adapter.act(draft, { type: "place", locationId: "commission_market", workerKey: "apprentice-senior" }, c.model, c.engine);
    expect(action).toEqual({ type: "place", locationId: "commission_market", workerKey: "apprentice-senior" });
    const placed = workDraft.reduce(draft, action as WorkAction, c.model, c.engine);
    expect(adapter.select(placed, c.model, c.engine).activePlacement).toEqual({ locationId: "commission_market", workerKey: "apprentice-senior" });
    // V1.6.2: nothing is reserved at placement (the look comes first), so the display is no target yet.
    expect(adapter.act(placed, { type: "order", key: "slot:3" }, c.model, c.engine)).toBeNull();
    expect(adapter.select(placed, c.model, c.engine).orderTargets.size).toBe(0);
  });

  it("work: the Colour Samples swap makes each held Order a target; a click chooses it to give up", () => {
    const c = ctx("m17_after_action");
    const adapter = WINDOWS.work.table;
    if (adapter === undefined) throw new Error("no adapter");
    const hand = c.view.own?.orderHand ?? [];
    // After the action the swap is m17's only entry; nothing is chosen until the player presses it (D21).
    const plain = workDraft.reduce(workDraft.initial(c.model, c.engine), { type: "mode", mode: "end_turn" }, c.model, c.engine);
    expect(adapter.select(plain, c.model, c.engine).orderTargets.size).toBe(0);
    const swap = workDraft.reduce(plain, { type: "mode", mode: "colour_samples_swap" }, c.model, c.engine);
    expect([...adapter.select(swap, c.model, c.engine).orderTargets.keys()]).toEqual(hand);
    const action = adapter.act(swap, { type: "order", key: at(hand, 2) }, c.model, c.engine);
    expect(action).toEqual({ type: "swap", action: { type: "discard", orderId: hand[2] } });
    const chosen = workDraft.reduce(swap, action as WorkAction, c.model, c.engine);
    expect(adapter.select(chosen, c.model, c.engine).orderTargets.get(at(hand, 2))).toEqual({ state: "discard", disabled: false, reason: null });
    expect(adapter.act(swap, { type: "order", key: "O01" }, c.model, c.engine)).toBeNull();
  });

  it("work: a held Order the swap cannot give up is greyed out on the table with the engine's reason", () => {
    // Both Main Order piles and the display empty: giving up a Starting Order (to the box) would
    // leave no Order to reserve (B1, v1.6.2 L64); giving up a Main Order puts a card in the discard to look at.
    const c = ctxWith("m17_after_action", (view) => {
      view.game.counts.mainDeck = 0;
      view.game.counts.mainDiscard = 0;
      view.game.market.display = view.game.market.display.map(() => null);
      const own = view.own;
      if (own === null || own === undefined) throw new Error("no own state");
      if (!own.orderHand.some((orderId) => orderId.startsWith("S"))) own.orderHand = ["S01", ...own.orderHand.filter((orderId) => orderId !== "S01")];
    });
    const adapter = WINDOWS.work.table;
    if (adapter === undefined) throw new Error("no adapter");
    const swap = workDraft.reduce(workDraft.initial(c.model, c.engine), { type: "mode", mode: "colour_samples_swap" }, c.model, c.engine);
    const targets = adapter.select(swap, c.model, c.engine).orderTargets;
    const starting = (c.view.own?.orderHand ?? []).find((orderId) => orderId.startsWith("S"));
    const main = (c.view.own?.orderHand ?? []).find((orderId) => orderId.startsWith("O"));
    if (starting === undefined || main === undefined) throw new Error("hand needs a Starting and a Main Order");
    const blocked = targets.get(starting);
    expect(blocked).toMatchObject({ state: "choosable", disabled: true, reason: { kind: "rule", error: { code: "ORDER_SUPPLY_EMPTY" } } });
    expect(targets.get(main)).toEqual({ state: "choosable", disabled: false, reason: null });
    // A click on it is ignored.
    expect(adapter.act(swap, { type: "order", key: starting }, c.model, c.engine)).toBeNull();
  });

  it("work: Glaze & Load kiln targets fill the first load, then the second, with pending chips", () => {
    const c = ctx(DING);
    const adapter = WINDOWS.work.table;
    if (adapter === undefined) throw new Error("no adapter");
    let draft = work(c, { type: "worker", workerKey: "shifu" }, { type: "location", locationId: "glaze_load" });
    for (const action of [
      { type: "vessel", index: 0, ceramicId: "c1" },
      { type: "glaze", index: 0, glaze: "white" },
      { type: "second", on: true },
      { type: "vessel", index: 1, ceramicId: "c2" },
      { type: "glaze", index: 1, glaze: "celadon" },
    ] as const) draft = workDraft.reduce(draft, { type: "sub", locationId: "glaze_load", action }, c.model, c.engine);
    const targets = adapter.select(draft, c.model, c.engine).kilnTargets;
    expect([...targets.keys()].sort()).toEqual(["high_1", "high_2", "low_1", "middle_1"]);
    const click = (spaceId: "high_1" | "low_1") => {
      const action = adapter.act(draft, { type: "kilnSpace", spaceId }, c.model, c.engine);
      draft = workDraft.reduce(draft, action as WorkAction, c.model, c.engine);
    };
    click("high_1");
    click("low_1");
    expect(draft.perLocation.glaze_load.loads.map((load) => load.place)).toEqual(["high_1", "low_1"]);
    const selection = adapter.select(draft, c.model, c.engine);
    expect(selection.pendingCeramics).toEqual([
      { ceramicId: "c1", glaze: "white", at: "high_1" },
      { ceramicId: "c2", glaze: "celadon", at: "low_1" },
    ]);
    expect(selection.kilnTargets.get("high_1")).toEqual({ pressed: true });
    expect([...selection.highlightedCeramicIds].sort()).toEqual(["c1", "c2"]);
  });

  it("Setter's Mark: kiln targets are the open spaces; a kiln click chooses one", () => {
    const c = ctx("w-setters-mark-window");
    const adapter = WINDOWS.setters_mark.table;
    if (adapter === undefined) throw new Error("no adapter");
    const draft = settersMarkDraft.initial(c.model, c.engine);
    expect([...adapter.select(draft, c.model, c.engine).kilnTargets.keys()]).toEqual(settersMarkOptions(c.view));
    const action = adapter.act(draft, { type: "kilnSpace", spaceId: "middle_1" }, c.model, c.engine);
    const chosen = settersMarkDraft.reduce(draft, action as never, c.model, c.engine);
    expect(adapter.select(chosen, c.model, c.engine).kilnTargets.get("middle_1")).toEqual({ pressed: true });
  });

  it("Commission step: the looked-at Orders and the display slots are table targets, toggled into the reservation", () => {
    const c = ctx("m2_commission_market_look_r3_4p");
    const adapter = WINDOWS.commission.table;
    if (adapter === undefined) throw new Error("no adapter");
    const look = lookedOrderOptions(c.view);
    if (look === null) throw new Error("no look");
    let draft = selectDraft.initial(c.model, c.engine);
    const keys = [...adapter.select(draft, c.model, c.engine).orderTargets.keys()];
    expect(keys).toEqual([...look.faceUpSlots.map((slot) => `slot:${slot}`), ...look.orderIds]);
    draft = selectDraft.reduce(draft, adapter.act(draft, { type: "order", key: at(look.orderIds, 0) }, c.model, c.engine) as never, c.model, c.engine);
    draft = selectDraft.reduce(draft, adapter.act(draft, { type: "order", key: "slot:2" }, c.model, c.engine) as never, c.model, c.engine);
    const targets = adapter.select(draft, c.model, c.engine).orderTargets;
    expect(targets.get(at(look.orderIds, 0))).toEqual({ state: "chosen", disabled: false, reason: null });
    expect(targets.get("slot:2")).toEqual({ state: "chosen", disabled: false, reason: null });
    // The limit of 2 is reached: the other targets are unavailable, each with the pane's reason
    // (never a silent grey toggle); clicking a chosen one unticks it.
    const other = targets.get(at(look.orderIds, 1));
    expect(other).toMatchObject({ state: "choosable", disabled: true, reason: { kind: "message" } });
    expect(other?.reason?.kind === "message" ? [EN.message(other.reason.message), ZH.message(other.reason.message)] : null).toEqual(["You have chosen 2 already.", "你已经选了2张。"]);
    expect(targets.get("slot:0")?.disabled).toBe(true);
    const untick = adapter.act(draft, { type: "order", key: "slot:2" }, c.model, c.engine);
    expect(untick).toEqual({ type: "toggle", key: "slot:2", on: false });
    expect(adapter.act(draft, { type: "order", key: "O01" }, c.model, c.engine)).toBeNull();
  });

  it("Colour Samples' Selects: the display slots and the looked-at Orders are table targets; a display Choose toggle reserves a face-up Order (change 25)", () => {
    for (const [id, kind] of [
      ["m16_colour_samples", "colour_samples"],
      ["w-colour-samples-swap-look", "colour_samples_swap"],
    ] as const) {
      const c = ctx(id);
      const spec = WINDOWS[kind];
      const adapter = spec.table;
      if (adapter === undefined) throw new Error("no adapter");
      const draft = spec.draft.initial(c.model, c.engine);
      const look = lookedOrderOptions(c.view);
      if (look === null) throw new Error(id);
      expect([...adapter.select(draft, c.model, c.engine).orderTargets.keys()], id).toEqual([...look.faceUpSlots.map((slot) => `slot:${slot}`), ...look.orderIds]);
      const action = adapter.act(draft, { type: "order", key: at(look.orderIds, 0) }, c.model, c.engine);
      expect(action, id).toEqual({ type: "pick", key: lookPickKey(at(look.orderIds, 0)) });
      const chosen = spec.draft.reduce(draft, action as never, c.model, c.engine);
      expect(adapter.select(chosen, c.model, c.engine).orderTargets.get(at(look.orderIds, 0)), id).toEqual({ state: "chosen", disabled: false, reason: null });
      // The display's Choose toggle: the face-up Order replaces the looked card (a limit of 1).
      const slot = `slot:${at(look.faceUpSlots, 0)}`;
      const faceUp = spec.draft.reduce(chosen, adapter.act(chosen, { type: "order", key: slot }, c.model, c.engine) as never, c.model, c.engine);
      const targets = adapter.select(faceUp, c.model, c.engine).orderTargets;
      expect(targets.get(slot), id).toEqual({ state: "chosen", disabled: false, reason: null });
      expect(targets.get(at(look.orderIds, 0)), id).toEqual({ state: "choosable", disabled: false, reason: null });
      expect(spec.draft.build(faceUp, c.model, c.engine), id).toEqual({ type: "SELECT_CHOOSE", reservations: [{ kind: "face_up", slotIndex: at(look.faceUpSlots, 0), orderId: c.view.game.market.display[at(look.faceUpSlots, 0)] }] });
      expect(adapter.act(draft, { type: "order", key: "O48" }, c.model, c.engine), id).toBeNull();
    }
  });
});

// ── Verifier findings (phase B review): the forms offer exactly what the engine allows ───────

/** A fixture's view with an edit, as a context. */
function ctxWith(id: string, edit: (view: PlayerView) => void): Ctx {
  const view = structuredClone(fixture(id).playerView);
  edit(view);
  return ctxOf(view);
}

/** The viewer's player state in a view. */
function viewer(view: PlayerView) {
  const pid = view.viewerId;
  const p = pid === null ? undefined : view.game.players[pid];
  if (p === undefined) throw new Error("no viewer");
  return p;
}

/** The legal Form & Decorate commands of one worker kind (canonical, uncapped). */
function legalForms(c: Ctx, kind: "shifu" | "apprentice"): Array<Extract<GameAction, { type: "PLACE_FORM_DECORATE" }>> {
  const workerIds = new Set(placementOptions(c.view).find((option) => option.locationId === "form_decorate")?.workers.filter((worker) => worker.kind === kind && !worker.seniorApprentice).map((worker) => worker.workerId));
  return legalActions(c.view, { mode: "canonical", perFamilyLimit: Number.POSITIVE_INFINITY }).flatMap((action) =>
    action.type === "PLACE_FORM_DECORATE" && workerIds.has(action.workerId) ? [action] : [],
  );
}

/** The legal Glaze & Load commands (canonical, uncapped). */
function legalLoads(c: Ctx): Array<Extract<GameAction, { type: "PLACE_GLAZE_LOAD" }>> {
  return legalActions(c.view, { mode: "canonical", perFamilyLimit: Number.POSITIVE_INFINITY }).flatMap((action) => (action.type === "PLACE_GLAZE_LOAD" ? [action] : []));
}

function formOptions(c: Ctx, draft: WorkDraft) {
  const active = workDraft.options(draft, c.model, c.engine).active;
  if (active?.locationId !== "form_decorate") throw new Error("no Form & Decorate");
  return active.options;
}

function glazeOptions(c: Ctx, draft: WorkDraft) {
  const active = workDraft.options(draft, c.model, c.engine).active;
  if (active?.locationId !== "glaze_load") throw new Error("no Glaze & Load");
  return active.options;
}

/** 0 Clay and Large Throwing Wheel instead of Reworking Table (desktop-s202-3p-en r28). */
const noClayWheel = (view: PlayerView) => {
  const p = viewer(view);
  p.resources.clay = 0;
  p.techs = p.techs.map((tech) => (tech.id === "T05" ? { ...tech, id: "T01" } : tech));
};
/** 1 Clay (desktop-s303-4p-en t41–42). */
const oneClay = (view: PlayerView) => {
  viewer(view).resources.clay = 1;
};
/** Only one Shaped vessel left (desktop-s101-2p-en ticks 34–35): the others are Finished. */
const oneShaped = (view: PlayerView) => {
  for (const id of ["c2", "c3"]) {
    const ceramic = view.game.ceramics[id];
    if (ceramic?.stage !== "shaped") throw new Error(`${id} is not Shaped`);
    view.game.ceramics[id] = { ...ceramic, stage: "finished", glaze: "white", quality: "standard", crackle: false, firedInRound: 1 } as (typeof view.game.ceramics)[string];
  }
};

describe("Form & Decorate offers only what the engine allows (review findings)", () => {
  const fd = (action: Extract<WorkAction, { type: "sub"; locationId: "form_decorate" }>["action"]): WorkAction => ({ type: "sub", locationId: "form_decorate", action });

  it("each Shape, Decoration and the second vessel agree with the legal commands, in every probed state", () => {
    const cases: Array<[string, Ctx, "shifu" | "apprentice"]> = [
      ["rich", ctx(RICH), "shifu"],
      ["rich apprentice", ctx(RICH), "apprentice"],
      ["ding", ctx(DING), "shifu"],
      ["0 Clay + Wheel", ctxWith(DING, noClayWheel), "shifu"],
      ["1 Clay", ctxWith(DING, oneClay), "shifu"],
    ];
    for (const [name, c, kind] of cases) {
      const legal = legalForms(c, kind).filter((command) => command.dingExtra === undefined);
      const singles = legal.filter((command) => command.vessels.length === 1).map((command) => command.vessels[0]!);
      const draft = work(c, { type: "worker", workerKey: kind }, { type: "location", locationId: "form_decorate" });
      const options = formOptions(c, draft);
      const vessel = at(options.vessels, 0);
      expect(vessel.shapes.filter((entry) => entry.available).map((entry) => entry.shape), name).toEqual(SHAPES.filter((shape) => singles.some((spec) => spec.shape === shape)));
      expect(vessel.decorations.filter((entry) => entry.available).map((entry) => entry.decoration), name).toEqual(DECORATIONS.filter((decoration) => singles.some((spec) => spec.decoration === decoration)));
      expect(options.second !== null, name).toBe(legal.some((command) => command.vessels.length === 2));
      // An unavailable choice carries the engine's own error for that vessel.
      for (const entry of vessel.shapes.filter((candidate) => !candidate.available)) {
        expect(entry.reason, `${name} ${entry.shape}`).toEqual(validateAction(c.actor, { type: "PLACE_FORM_DECORATE", workerId: at(legalForms(c, kind), 0).workerId, vessels: [{ shape: entry.shape, decoration: "plain" }] }));
      }
      // After a Shape: the Decorations of the legal singles with that Shape.
      for (const shape of vessel.shapes.filter((entry) => entry.available).map((entry) => entry.shape)) {
        const chosen = workDraft.reduce(draft, fd({ type: "shape", index: 0, shape }), c.model, c.engine);
        const decorations = at(formOptions(c, chosen).vessels, 0).decorations.filter((entry) => entry.available).map((entry) => entry.decoration);
        expect(decorations, `${name} ${shape}`).toEqual(DECORATIONS.filter((decoration) => singles.some((spec) => spec.shape === shape && spec.decoration === decoration)));
      }
    }
  });

  it("0 Clay with Large Throwing Wheel: Bowl, Plate and Brush Washer are unavailable with the reason; a Vase takes the Wheel", () => {
    const c = ctxWith(DING, noClayWheel);
    let draft = work(c, { type: "worker", workerKey: "shifu" }, { type: "location", locationId: "form_decorate" });
    const shapes = at(formOptions(c, draft).vessels, 0).shapes;
    expect(shapes.filter((entry) => entry.available).map((entry) => entry.shape)).toEqual(["vase", "censer"]);
    const bowl = shapes.find((entry) => entry.shape === "bowl");
    expect(bowl?.reason?.code).toBe("INSUFFICIENT_RESOURCES");
    // An unavailable Shape is ignored; the Ding vessel is not offered (Ding copies a Bowl, Plate or Brush Washer).
    expect(workDraft.reduce(draft, fd({ type: "shape", index: 0, shape: "bowl" }), c.model, c.engine)).toBe(draft);
    draft = workDraft.reduce(draft, fd({ type: "shape", index: 0, shape: "vase" }), c.model, c.engine);
    expect(formOptions(c, draft).ding).toBeNull();
    expect(workDraft.reduce(draft, fd({ type: "ding", on: true }), c.model, c.engine)).toBe(draft);
    draft = workDraft.reduce(draft, fd({ type: "decoration", index: 0, decoration: "plain" }), c.model, c.engine);
    expect(draft.perLocation.form_decorate.wheel).toBe(true);
    const command = workDraft.build(draft, c.model, c.engine);
    expect(command).toMatchObject({ useLargeThrowingWheel: true, vessels: [{ shape: "vase", decoration: "plain" }] });
    expect(validateAction(c.actor, command as GameAction)).toBeNull();
    expect(formOptions(c, draft).second).toBeNull();
  });

  it("1 Clay with the Shifu: no second vessel is offered, and asking for one changes nothing", () => {
    const c = ctxWith(DING, oneClay);
    expect(legalForms(c, "shifu").some((command) => command.vessels.length === 2)).toBe(false);
    const draft = work(c, { type: "worker", workerKey: "shifu" }, { type: "location", locationId: "form_decorate" });
    expect(formOptions(c, draft).second).toBeNull();
    expect(workDraft.reduce(draft, fd({ type: "second", on: true }), c.model, c.engine)).toBe(draft);
  });

  it("Ding's vessel is offered only once the Shapes are chosen, and only for a Shape Ding copies", () => {
    const c = ctx(DING);
    let draft = work(c, { type: "worker", workerKey: "shifu" }, { type: "location", locationId: "form_decorate" });
    expect(formOptions(c, draft).ding).toBeNull();
    draft = workDraft.reduce(draft, fd({ type: "shape", index: 0, shape: "vase" }), c.model, c.engine);
    expect(formOptions(c, draft).ding).toBeNull();
    expect(workDraft.reduce(draft, fd({ type: "ding", on: true }), c.model, c.engine)).toBe(draft);
    draft = workDraft.reduce(draft, fd({ type: "shape", index: 0, shape: "bowl" }), c.model, c.engine);
    const ding = formOptions(c, draft).ding;
    expect(ding?.indexes).toEqual([0]);
    expect(ding?.decorations.every((entry) => entry.available)).toBe(true);
    draft = workDraft.reduce(draft, fd({ type: "ding", on: true }), c.model, c.engine);
    expect(draft.perLocation.form_decorate.ding).toEqual({ index: 0, decoration: null });
    // Changing to a Vase drops the Ding vessel.
    draft = workDraft.reduce(draft, fd({ type: "shape", index: 0, shape: "vase" }), c.model, c.engine);
    expect(draft.perLocation.form_decorate.ding).toBeNull();
    // With 1 Clay a Bowl and Ding's vessel cannot both be paid: no Ding.
    const poor = ctxWith(DING, oneClay);
    let bowl = work(poor, { type: "worker", workerKey: "shifu" }, { type: "location", locationId: "form_decorate" });
    bowl = workDraft.reduce(bowl, fd({ type: "shape", index: 0, shape: "bowl" }), poor.model, poor.engine);
    expect(legalForms(poor, "shifu").some((command) => command.dingExtra !== undefined)).toBe(false);
    expect(formOptions(poor, bowl).ding).toBeNull();
  });
});

describe("Glaze & Load second load (review findings)", () => {
  const gl = (action: Extract<WorkAction, { type: "sub"; locationId: "glaze_load" }>["action"]): WorkAction => ({ type: "sub", locationId: "glaze_load", action });

  it("one Shaped vessel: the Shifu is offered no second load, as no two-load command is legal", () => {
    const c = ctxWith(DING, oneShaped);
    expect(legalLoads(c).some((command) => command.loads.length === 2)).toBe(false);
    const draft = work(c, { type: "worker", workerKey: "shifu" }, { type: "location", locationId: "glaze_load" });
    expect(draft.perLocation.glaze_load.loads.map((load) => load.ceramicId)).toEqual(["c1"]);
    expect(glazeOptions(c, draft).second).toBe(false);
    expect(workDraft.reduce(draft, gl({ type: "second", on: true }), c.model, c.engine)).toBe(draft);
  });

  it("a later load never lists the vessel an earlier load has chosen, even before that load is complete", () => {
    const c = ctx(DING);
    let draft = work(c, { type: "worker", workerKey: "shifu" }, { type: "location", locationId: "glaze_load" });
    draft = workDraft.reduce(draft, gl({ type: "vessel", index: 0, ceramicId: "c1" }), c.model, c.engine);
    expect(glazeOptions(c, draft).second).toBe(true);
    draft = workDraft.reduce(draft, gl({ type: "second", on: true }), c.model, c.engine);
    const second = at(glazeOptions(c, draft).loads, 1);
    expect(second.vessels.map((vessel) => vessel.ceramicId)).not.toContain("c1");
    expect(second.vessels.map((vessel) => vessel.ceramicId)).toEqual(["c2", "c3"]);
    draft = workDraft.reduce(draft, gl({ type: "vessel", index: 1, ceramicId: "c1" }), c.model, c.engine);
    expect(draft.perLocation.glaze_load.loads[1]?.ceramicId).toBeNull();
    draft = workDraft.reduce(draft, gl({ type: "vessel", index: 1, ceramicId: "c2" }), c.model, c.engine);
    // Load 1 switches to the vessel load 2 holds: load 2's copy is dropped.
    draft = workDraft.reduce(draft, gl({ type: "vessel", index: 0, ceramicId: "c2" }), c.model, c.engine);
    expect(draft.perLocation.glaze_load.loads.map((load) => load.ceramicId)).toEqual(["c2", null]);
  });

  it("with two Shaped vessels the second load is offered before the first is chosen, and goes when none can follow", () => {
    const c = ctxWith(DING, (view) => {
      const ceramic = view.game.ceramics["c3"];
      if (ceramic?.stage !== "shaped") throw new Error("c3 is not Shaped");
      view.game.ceramics["c3"] = { ...ceramic, stage: "finished", glaze: "white", quality: "standard", crackle: false, firedInRound: 1 } as (typeof view.game.ceramics)[string];
    });
    let draft = work(c, { type: "worker", workerKey: "shifu" }, { type: "location", locationId: "glaze_load" });
    expect(glazeOptions(c, draft).second).toBe(true);
    draft = workDraft.reduce(draft, gl({ type: "second", on: true }), c.model, c.engine);
    draft = workDraft.reduce(draft, gl({ type: "vessel", index: 0, ceramicId: "c1" }), c.model, c.engine);
    expect(at(glazeOptions(c, draft).loads, 1).vessels.map((vessel) => vessel.ceramicId)).toEqual(["c2"]);
  });
});


