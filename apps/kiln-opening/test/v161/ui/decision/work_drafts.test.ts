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
  dingCopyableVesselIndexes,
  formDiscountVariants,
  glazeLoadVesselOptions,
  guildInspectionOptions,
  guildOptions,
  heatMarkerTargets,
  imperialPriorityOptions,
  kilnSelectionOptions,
  legalActions,
  loadDestinationOptions,
  lookedOrderOptions,
  magistratesHallQuote,
  materialsYardOptions,
  placementLimits,
  placementOptions,
  quoteFormDecorate,
  quoteMaterialsYard,
  settersMarkOptions,
  validateAction,
  DECORATIONS,
  SHAPES,
} from "../../../../src/game/index.ts";
import type { ActorView, GameAction, KilnId, LoadSpec, OrderId, PlayerView } from "../../../../src/game/index.ts";
import { WINDOWS } from "../../../../src/app/decision/windows.ts";
import { colourSamplesDraft } from "../../../../src/app/decision/work/ColourSamples.draft.ts";
import { commissionDraft, reservedThisTurn } from "../../../../src/app/decision/work/CommissionStep.draft.ts";
import { guildInspectionDraft } from "../../../../src/app/decision/work/GuildInspection.draft.ts";
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
const DING = "w-before-the-worker-action-canal-barge-imperial-priority-with-reworking-table-ding";
const INVERTED = "w-before-the-worker-action-kiln-furniture-inverted-firing-targets-setters-marks-senior-apprentice";
const FURNITURE = "t-glaze-load-imperial-furniture";

// ── The work turn ─────────────────────────────────────────────────────────────────────────

describe("work draft: worker, location and per-location sub-drafts", () => {
  it("pre-selects nothing when several workers exist; Place is the step", () => {
    const c = ctx("m1_work_phase_r2_3p");
    const draft = workDraft.initial(c.model, c.engine);
    expect(draft.mode).toBe("place");
    expect(draft.workerKey).toBeNull();
    expect(draft.locationId).toBeNull();
    expect(workDraft.build(draft, c.model, c.engine)).toBeNull();
    expect(sentences(WINDOWS.work, draft, c)[0]).toBe("Place a worker on an open action space.");
  });

  it("pre-selects the only worker kind left, but not a location among several", () => {
    const c = ctx("m5_two_player_board_2p");
    const draft = workDraft.initial(c.model, c.engine);
    expect(draft.workerKey).toBe("apprentice");
    expect(draft.locationId).toBeNull();
  });

  it("offers the worker entries of placementOptions, Senior Apprentice included", () => {
    const c = ctx(RICH);
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
    const c = ctx("m5_two_player_board_2p");
    const options = workDraft.options(workDraft.initial(c.model, c.engine), c.model, c.engine);
    const glaze = options.locations.find((choice) => choice.locationId === "glaze_load");
    expect(glaze?.error?.code).toBe("PERSONAL_SPACE_LOCKED");
  });

  it("ignores an unavailable location, and takes the only legal worker of a location", () => {
    const c = ctx("m1_work_phase_r2_3p");
    expect(work(c, { type: "location", locationId: "guild_hall" }).locationId).toBeNull();
    const draft = work(c, { type: "worker", workerKey: "shifu" }, { type: "location", locationId: "materials_yard" });
    expect(draft.locationId).toBe("materials_yard");
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
    const c = ctx("m1_work_phase_r2_3p");
    const stale: WorkDraft = { ...work(c), workerKey: "apprentice-senior", locationId: "guild_hall" };
    const next = workDraft.reduce(stale, REVALIDATE, c.model, c.engine);
    expect(next.workerKey).toBeNull();
    expect(next.locationId).toBeNull();
    const settled = work(c, { type: "worker", workerKey: "shifu" }, { type: "location", locationId: "canal_wharf" });
    expect(workDraft.reduce(settled, REVALIDATE, c.model, c.engine)).toBe(settled);
  });

  it("builds the placement and says so in both languages", () => {
    const c = ctx("m1_work_phase_r2_3p");
    const draft = work(c, { type: "worker", workerKey: "shifu" }, { type: "location", locationId: "canal_wharf" });
    const command = workDraft.build(draft, c.model, c.engine);
    expect(command).toEqual({ type: "PLACE_CANAL_WHARF", workerId: c.model.me?.availableWorkerIds[0] });
    expect(validateAction(c.actor, command as GameAction)).toBeNull();
    const [en, zh] = sentences(WINDOWS.work, draft, c);
    expect(en).toBe("Place Shifu at Canal Wharf — +4 Coins");
    expect(zh).toBe("派师傅到漕运码头：得4铜钱");
  });

  it("offers Imperial Priority and Canal Barge before the action when they are usable", () => {
    const c = ctx(DING);
    const options = workDraft.options(workDraft.initial(c.model, c.engine), c.model, c.engine);
    expect(options.modes.map((mode) => mode.mode)).toEqual(["place", "imperial_priority", "canal_barge"]);
    expect(options.imperialPriority?.usable).toBe(true);
    const plain = ctx("m1_work_phase_r2_3p");
    expect(workDraft.options(workDraft.initial(plain.model, plain.engine), plain.model, plain.engine).modes.map((mode) => mode.mode)).toEqual(["place"]);
  });

  it("after the action: Imperial Priority, Canal Barge or End turn; End turn alone is pre-selected", () => {
    const after = ctx("w-after-the-worker-action");
    const draft = workDraft.initial(after.model, after.engine);
    expect(workDraft.options(draft, after.model, after.engine).modes.map((mode) => mode.mode)).toEqual(["imperial_priority", "canal_barge", "end_turn"]);
    expect(draft.mode).toBeNull();
    expect(WINDOWS.work.alternative?.(draft, after.model, after.engine)?.command).toEqual({ type: "END_TURN" });
    const ending = workDraft.reduce(draft, { type: "mode", mode: "end_turn" }, after.model, after.engine);
    expect(workDraft.build(ending, after.model, after.engine)).toEqual({ type: "END_TURN" });
    const only = ctx("m17_after_action");
    expect(workDraft.initial(only.model, only.engine).mode).toBe("end_turn");
    expect(workDraft.build(workDraft.initial(only.model, only.engine), only.model, only.engine)).toEqual({ type: "END_TURN" });
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
  it("offers every split of the worker's resources, and the Shifu bonus with the engine's reason", () => {
    const c = ctx("m1_work_phase_r2_3p");
    const draft = work(c, { type: "worker", workerKey: "shifu" }, { type: "location", locationId: "materials_yard" });
    const active = workDraft.options(draft, c.model, c.engine).active;
    if (active?.locationId !== "materials_yard") throw new Error("no Materials Yard");
    const worker = placementOptions(c.view).find((option) => option.locationId === "materials_yard")?.workers.find((entry) => entry.kind === "shifu");
    if (worker === undefined) throw new Error("no Shifu");
    const selector = materialsYardOptions(c.view, worker);
    expect(active.options.splits.map((split) => split.clay + split.wood)).toEqual(new Array(selector.resources + 1).fill(selector.resources));
    expect(active.options.bonus?.available).toBe(selector.shifuBonus?.ok);
    expect(active.options.bonus?.pay.coins).toBe(placementLimits(c.view, "materials_yard", "shifu").bonus.coins);
    // No Coin: the bonus cannot be bought, and a draft asking for it drops it.
    const asked = workDraft.reduce(draft, { type: "sub", locationId: "materials_yard", action: { type: "bonus", on: true } }, c.model, c.engine);
    expect(asked.perLocation.materials_yard.bonus).toBe(false);
  });

  it("builds a split with the bonus and quotes it with quoteMaterialsYard", () => {
    const c = ctx(RICH);
    let draft = work(c, { type: "worker", workerKey: "shifu" }, { type: "location", locationId: "materials_yard" });
    draft = workDraft.reduce(draft, { type: "sub", locationId: "materials_yard", action: { type: "clay", clay: 3 } }, c.model, c.engine);
    draft = workDraft.reduce(draft, { type: "sub", locationId: "materials_yard", action: { type: "bonus", on: true } }, c.model, c.engine);
    const command = workDraft.build(draft, c.model, c.engine);
    expect(command).toMatchObject({ type: "PLACE_MATERIALS_YARD", clay: 3, wood: 1, buyShifuBonus: true });
    const active = workDraft.options(draft, c.model, c.engine).active;
    if (active?.locationId !== "materials_yard" || command?.type !== "PLACE_MATERIALS_YARD") throw new Error("no Materials Yard");
    expect(active.options.quote).toEqual(quoteMaterialsYard(c.actor, command));
    expect(validateAction(c.actor, command)).toBeNull();
  });

  it("offers Prepared Clay Decorations per chosen Shape from the selector's legal pairs only", () => {
    const view = structuredClone(fixture("m1_work_phase_r2_3p").playerView);
    const me = view.viewerId;
    if (me === null) throw new Error("no viewer");
    const player = view.game.players[me];
    if (player === undefined) throw new Error("no player");
    player.resources = { clay: 0, wood: 2, coins: 3 };
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
      ["m5_two_player_board_2p", "apprentice"],
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

  it("shows each Shape's and Decoration's printed cost from the quote lines", () => {
    const c = ctx(RICH);
    const draft = work(c, { type: "worker", workerKey: "shifu" }, { type: "location", locationId: "form_decorate" });
    const active = workDraft.options(draft, c.model, c.engine).active;
    if (active?.locationId !== "form_decorate") throw new Error("no Form & Decorate");
    expect(active.options.shapes.map((entry) => entry.shape)).toEqual([...SHAPES]);
    expect(active.options.shapes.map((entry) => entry.clay)).toEqual([1, 1, 1, 2, 2]);
    expect(active.options.decorations.map((entry) => entry.coins)).toEqual([2, 2, 2, 2]);
    expect(active.options.maxVessels).toBe(placementLimits(c.view, "form_decorate", "shifu").maxVessels);
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

  it("offers the Shifu's Heat marker on heatMarkerTargets only, and none to the Apprentice", () => {
    const c = ctx(INVERTED);
    let draft = glazeDraft(c);
    draft = workDraft.reduce(draft, sub({ type: "vessel", index: 0, ceramicId: "c2" }), c.model, c.engine);
    let active = workDraft.options(draft, c.model, c.engine).active;
    if (active?.locationId !== "glaze_load") throw new Error("no Glaze & Load");
    const pending: LoadSpec[] = [{ ceramicId: "c2", glaze: "white", destination: { kiln: "imperial", imperialModifier: 0 } }];
    expect(active.options.marker?.targets).toEqual(heatMarkerTargets(c.view, c.actor.viewerId, pending));
    draft = workDraft.reduce(draft, sub({ type: "marker", ceramicId: "c9" }), c.model, c.engine);
    expect(draft.perLocation.glaze_load.marker).toBeNull();
    draft = workDraft.reduce(draft, sub({ type: "marker", ceramicId: "c1" }), c.model, c.engine);
    expect(draft.perLocation.glaze_load.marker).toBe("c1");
    const apprentice = glazeDraft(c, "apprentice");
    active = workDraft.options(apprentice, c.model, c.engine).active;
    if (active?.locationId !== "glaze_load") throw new Error("no Glaze & Load");
    expect(active.options.marker).toBeNull();
    expect(active.options.maxLoads).toBe(placementLimits(c.view, "glaze_load", "apprentice").maxLoads);
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
  it("offers face-up slots, blind and (Shifu) the look from commissionOptions; face-up needs a gain", () => {
    const c = ctx("m1_work_phase_r2_3p");
    let draft = work(c, { type: "worker", workerKey: "apprentice" }, { type: "location", locationId: "commission_market" });
    let active = workDraft.options(draft, c.model, c.engine).active;
    if (active?.locationId !== "commission_market") throw new Error("no Commission Market");
    expect(active.options.look).toBe(false);
    expect(active.options.slots.map((slot) => slot.slotIndex)).toEqual([0, 1, 2, 3, 4, 5]);
    draft = workDraft.reduce(draft, { type: "sub", locationId: "commission_market", action: { type: "first", first: "slot:2" } }, c.model, c.engine);
    expect(workDraft.build(draft, c.model, c.engine)).toBeNull();
    draft = workDraft.reduce(draft, { type: "sub", locationId: "commission_market", action: { type: "gain", gain: "wood" } }, c.model, c.engine);
    const command = workDraft.build(draft, c.model, c.engine);
    expect(command).toMatchObject({ type: "PLACE_COMMISSION_MARKET", first: { kind: "face_up", slotIndex: 2, orderId: c.view.game.market.display[2], gain: "wood" } });
    expect(validateAction(c.actor, command as GameAction)).toBeNull();
    draft = workDraft.reduce(draft, { type: "sub", locationId: "commission_market", action: { type: "first", first: "look" } }, c.model, c.engine);
    expect(draft.perLocation.commission_market.first).toBe("slot:2");
    const shifu = work(c, { type: "worker", workerKey: "shifu" }, { type: "location", locationId: "commission_market" });
    active = workDraft.options(shifu, c.model, c.engine).active;
    if (active?.locationId !== "commission_market") throw new Error("no Commission Market");
    expect(active.options.look).toBe(true);
  });

  it("buys only a legal face-up Tech with the Apprentice; the Shifu inspects a discipline", () => {
    const c = ctx("m5_two_player_board_2p");
    const guild = guildOptions(c.view, "apprentice");
    let draft = work(c, { type: "location", locationId: "guild_hall" });
    const illegal = guild.faceUp.find((tech) => !tech.legal);
    const legal = guild.faceUp.find((tech) => tech.legal);
    if (illegal === undefined || legal === undefined) throw new Error("fixture changed");
    draft = workDraft.reduce(draft, { type: "sub", locationId: "guild_hall", action: { type: "tech", techId: illegal.techId } }, c.model, c.engine);
    expect(draft.perLocation.guild_hall.techId).toBeNull();
    draft = workDraft.reduce(draft, { type: "sub", locationId: "guild_hall", action: { type: "tech", techId: legal.techId } }, c.model, c.engine);
    expect(workDraft.build(draft, c.model, c.engine)).toMatchObject({ type: "PLACE_GUILD_HALL", choice: { kind: "buy_face_up", techId: legal.techId } });
    const inspector = ctx(INVERTED);
    let shifu = work(inspector, { type: "worker", workerKey: "shifu" }, { type: "location", locationId: "guild_hall" });
    shifu = workDraft.reduce(shifu, { type: "sub", locationId: "guild_hall", action: { type: "discipline", discipline: "firing" } }, inspector.model, inspector.engine);
    expect(workDraft.build(shifu, inspector.model, inspector.engine)).toMatchObject({ choice: { kind: "inspect", discipline: "firing" } });
  });

  it("shows the Magistrate's Hall price and the Recognition reached from magistratesHallQuote", () => {
    const c = ctx(RICH);
    const draft = work(c, { type: "worker", workerKey: "shifu" }, { type: "location", locationId: "magistrates_hall" });
    const active = workDraft.options(draft, c.model, c.engine).active;
    if (active?.locationId !== "magistrates_hall") throw new Error("no Magistrate's Hall");
    const quote = magistratesHallQuote(c.view, "shifu");
    expect(active.options.reachable).toBe(quote.reachable);
    expect(active.options.quote.pay).toEqual(quote.pay);
    expect(workDraft.build(draft, c.model, c.engine)).toMatchObject({ type: "PLACE_MAGISTRATES_HALL" });
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
  });
});

describe("Commission Market steps", () => {
  it("reserves again or stops; Stop is also ConfirmBar's alternative", () => {
    const c = ctx("w-commission-market-second-reservation-or-stop");
    const draft = commissionDraft.initial(c.model, c.engine);
    expect(commissionDraft.options(draft, c.model, c.engine).canStop).toBe(true);
    expect(WINDOWS.commission.alternative?.(draft, c.model, c.engine)?.command).toEqual({ type: "COMMISSION_STOP" });
    const stop = commissionDraft.reduce(draft, { type: "reserve", reserve: "stop" }, c.model, c.engine);
    expect(commissionDraft.build(stop, c.model, c.engine)).toEqual({ type: "COMMISSION_STOP" });
    const slot = commissionDraft.reduce(draft, { type: "reserve", reserve: "slot:1" }, c.model, c.engine);
    expect(commissionDraft.build(slot, c.model, c.engine)).toBeNull();
    const gained = commissionDraft.reduce(slot, { type: "gain", gain: "coins" }, c.model, c.engine);
    expect(commissionDraft.build(gained, c.model, c.engine)).toMatchObject({ type: "COMMISSION_RESERVE", choice: { kind: "face_up", slotIndex: 1, gain: "coins" } });
  });

  it("reserves one of the privately looked-at Orders", () => {
    const c = ctx("m2_commission_market_look_r3_4p");
    const draft = commissionDraft.initial(c.model, c.engine);
    const looked = lookedOrderOptions(c.view)?.orderIds ?? [];
    expect(commissionDraft.options(draft, c.model, c.engine).looked).toEqual(looked);
    expect(commissionDraft.reduce(draft, { type: "looked", orderId: "O01" }, c.model, c.engine).looked).toBeNull();
    const chosen = commissionDraft.reduce(draft, { type: "looked", orderId: at(looked, 1) }, c.model, c.engine);
    expect(commissionDraft.build(chosen, c.model, c.engine)).toEqual({ type: "COMMISSION_CHOOSE_LOOKED", orderId: looked[1] });
    expect(WINDOWS.commission.alternative?.(chosen, c.model, c.engine) ?? null).toBeNull();
  });

  it("gains a resource after a blind reservation", () => {
    const c = ctx("w-commission-market-resource-after-a-blind-reservation");
    const draft = commissionDraft.reduce(commissionDraft.initial(c.model, c.engine), { type: "resource", resource: "clay" }, c.model, c.engine);
    expect(commissionDraft.build(draft, c.model, c.engine)).toEqual({ type: "COMMISSION_GAIN", resource: "clay" });
    expect(sentences(WINDOWS.commission, draft, c)).toEqual(["Gain 1 Clay", "得1泥"]);
  });
});

describe("Guild Hall inspection", () => {
  it("takes one Tech and orders every untaken inspected Tech for the deck bottom", () => {
    const c = ctx("m12_guild_shifu_inspection");
    const options = guildInspectionOptions(c.view);
    if (options === null) throw new Error("no inspection");
    const inspected = options.inspected.map((option) => option.techId);
    let draft = guildInspectionDraft.initial(c.model, c.engine);
    expect(draft).toEqual({ take: null, bottomOrder: inspected });
    expect(guildInspectionDraft.build(draft, c.model, c.engine)).toBeNull();
    const first = options.inspected.find((option) => option.legal);
    if (first === undefined) throw new Error("no legal inspected Tech");
    draft = guildInspectionDraft.reduce(draft, { type: "take", take: { kind: "inspected", techId: first.techId } }, c.model, c.engine);
    expect(draft.bottomOrder).toEqual(inspected.filter((techId) => techId !== first.techId));
    expect(draft.bottomOrder).toHaveLength(options.bottomOrderLengthIfInspectedTaken);
    const faceUp = options.faceUp.find((option) => option.legal);
    if (faceUp !== undefined) {
      const reversed = [...inspected].reverse();
      draft = guildInspectionDraft.reduce(draft, { type: "take", take: { kind: "face_up", techId: faceUp.techId } }, c.model, c.engine);
      draft = guildInspectionDraft.reduce(draft, { type: "reorder", bottomOrder: reversed }, c.model, c.engine);
      expect(draft.bottomOrder).toEqual(reversed);
      const command = guildInspectionDraft.build(draft, c.model, c.engine);
      expect(command).toEqual({ type: "GUILD_TAKE", take: { kind: "face_up", techId: faceUp.techId }, bottomOrder: reversed });
      expect(validateAction(c.actor, command as GameAction)).toBeNull();
    }
    expect(guildInspectionDraft.reduce(draft, { type: "reorder", bottomOrder: ["T99" as never] }, c.model, c.engine)).toBe(draft);
  });

  it("ignores a Tech the engine says cannot be taken", () => {
    const c = ctx("w-guild-hall-shifu-inspection");
    const options = guildInspectionOptions(c.view);
    const illegal = options?.faceUp.find((option) => !option.legal);
    if (illegal === undefined) return;
    const draft = guildInspectionDraft.reduce(guildInspectionDraft.initial(c.model, c.engine), { type: "take", take: { kind: "face_up", techId: illegal.techId } }, c.model, c.engine);
    expect(draft.take).toBeNull();
  });
});

describe("Colour Samples, Kiln selection and Setter's Mark", () => {
  it("reserves one of the Colour Samples Orders", () => {
    const c = ctx("m16_colour_samples");
    const looked = lookedOrderOptions(c.view);
    expect(looked?.kind).toBe("colour_samples");
    const draft = colourSamplesDraft.reduce(colourSamplesDraft.initial(c.model, c.engine), { type: "order", orderId: at<OrderId>(looked?.orderIds, 0) }, c.model, c.engine);
    expect(colourSamplesDraft.build(draft, c.model, c.engine)).toEqual({ type: "COLOUR_SAMPLES_CHOOSE", orderId: looked?.orderIds[0] });
  });

  it("offers every available Kiln from kilnSelectionOptions and never a taken one", () => {
    const view = structuredClone(fixture("m15_kiln_selection").playerView);
    const other = view.game.playerOrder.find((pid) => pid !== view.viewerId);
    const otherPlayer = other === undefined ? undefined : view.game.players[other];
    if (otherPlayer === undefined) throw new Error("no other player");
    otherPlayer.kilnId = "JU";
    const c = ctxOf(view);
    const options = kilnSelectionDraft.options(kilnSelectionDraft.initial(c.model, c.engine), c.model, c.engine);
    expect(options.kilns).toEqual(kilnSelectionOptions(view));
    expect(options.kilns.find((kiln) => kiln.kilnId === "JU")).toMatchObject({ available: false, chosenBy: other });
    const draft = kilnSelectionDraft.initial(c.model, c.engine);
    expect(kilnSelectionDraft.reduce(draft, { type: "kiln", kilnId: "JU" }, c.model, c.engine).kilnId).toBeNull();
    for (const kilnId of ["RU", "GU", "GE", "DI"] as KilnId[]) {
      const chosen = kilnSelectionDraft.reduce(draft, { type: "kiln", kilnId }, c.model, c.engine);
      expect(kilnSelectionDraft.build(chosen, c.model, c.engine)).toEqual({ type: "SELECT_KILN", kilnId });
    }
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
    const c = ctx(RICH);
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
    const slot = workDraft.reduce(placed, adapter.act(placed, { type: "order", key: "slot:3" }, c.model, c.engine) as WorkAction, c.model, c.engine);
    expect(slot.perLocation.commission_market.first).toBe("slot:3");
    expect(adapter.select(slot, c.model, c.engine).orderTargets.get("slot:3")).toEqual({ state: "chosen", disabled: false });
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

  it("Commission look and Colour Samples: the looked-at Orders are table targets", () => {
    for (const [id, kind] of [
      ["m2_commission_market_look_r3_4p", "commission"],
      ["m16_colour_samples", "colour_samples"],
    ] as const) {
      const c = ctx(id);
      const spec = WINDOWS[kind];
      const adapter = spec.table;
      if (adapter === undefined) throw new Error("no adapter");
      const draft = spec.draft.initial(c.model, c.engine);
      const looked = lookedOrderOptions(c.view)?.orderIds ?? [];
      expect([...adapter.select(draft, c.model, c.engine).orderTargets.keys()]).toEqual(looked);
      const action = adapter.act(draft, { type: "order", key: looked[0] ?? "" }, c.model, c.engine);
      const chosen = spec.draft.reduce(draft, action as never, c.model, c.engine);
      expect(adapter.select(chosen, c.model, c.engine).orderTargets.get(looked[0] ?? "")).toEqual({ state: "chosen", disabled: false });
      expect(adapter.act(draft, { type: "order", key: "O48" }, c.model, c.engine)).toBeNull();
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
      ["m5 apprentice", ctx("m5_two_player_board_2p"), "apprentice"],
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

describe("Commission Market: the Orders already reserved this turn (review finding)", () => {
  const logOf = (id: string) => fixtureSource(id).getSnapshot().log;

  it("names the face-up Order reserved earlier in this action, and nothing from earlier turns", () => {
    expect(reservedThisTurn(logOf("w-commission-market-second-reservation-or-stop"), "p1")).toEqual([{ orderId: "O01", slotIndex: 0, source: "face_up" }]);
    expect(reservedThisTurn(logOf("m2_commission_market_look_r3_4p"), "p2")).toEqual([{ orderId: "O32", slotIndex: 0, source: "face_up" }]);
    expect(reservedThisTurn(logOf("w-commission-market-top-3-choice"), "p1")).toEqual([]);
  });

  it("names a blind Order only from the seat's own record", () => {
    const log = logOf("w-commission-market-resource-after-a-blind-reservation");
    expect(reservedThisTurn(log, "p1")).toEqual([{ orderId: "O07", slotIndex: null, source: "blind" }]);
    const publicOnly = log.map(({ own: _own, ...entry }) => entry);
    expect(reservedThisTurn(publicOnly, "p1")).toEqual([{ orderId: null, slotIndex: null, source: "blind" }]);
    expect(reservedThisTurn(log, "p2")).toEqual([]);
  });
});
