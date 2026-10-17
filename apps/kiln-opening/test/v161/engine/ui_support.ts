/**
 * Support for the production-UI selector suites (`ui_selectors.test.ts`,
 * `selector_agreement.test.ts`; UI_V1.6.1_ARCHITECTURE.md §5): a seeded game driver that
 * visits every decision, and the D3/D4 key allow-list of `FiringStageView`.
 */

import { DECORATIONS, FIRING, GLAZES, KILN_SPACE_IDS, LOCATIONS, LOCATION_IDS, SHAPES, TECHS } from "../../../src/game/content.ts";
import { validateAction } from "../../../src/game/engine.ts";
import { validateContribution } from "../../../src/game/firing/contributions.ts";
import { legalCommands, sampleLegalAction } from "../../../src/game/legalActions.ts";
import { SeededRandom } from "../../../src/game/rng.ts";
import {
  canalBargeOptions,
  crackleDeclarationChecks,
  glazeLoadVesselOptions,
  imperialPriorityOptions,
  materialsYardOptions,
  orderMatchOptions,
  placementLimits,
  placementOptions,
  playerSummary,
} from "../../../src/game/selectors.ts";
import { ceramicsOf, decisionPrompt, lookup, player } from "../../../src/game/state.ts";
import { techReady } from "../../../src/game/techs.ts";
import type {
  ActorView,
  AuthoritativeCommand,
  CrackleDeclaration,
  Decoration,
  FiringStageView,
  GameAction,
  GameState,
  LoadSpec,
  PlacementWorkerOption,
  PlayerCount,
  PlayerId,
  PrivateFiringState,
  Shape,
  SubmitContributionCommand,
} from "../../../src/game/types.ts";
import { actorViewOf } from "../../../src/game/view.ts";
import { DIRECTED_WEIGHTS, FuzzTable, richStartState } from "./p7_support.ts";
import { buildState, type StateSpec } from "./support/fixtures.ts";
import { LocalTable } from "./support/localTable.ts";

export interface DriveOptions {
  seed: number;
  playerCount: PlayerCount;
  /** `rich`: a Round 1 state with Techs, Recognition and ceramics (p7_support), so deep paths
   * (Imperial Kiln, Kiln Master, Second Firing, Crackle) are visited. */
  start?: "new" | "rich";
  chooserSeed?: number;
  maxCommands?: number;
}

/**
 * Plays one seeded game to the end with the directed sampler, calling `visit` before every
 * decision with the acting player. Every command is validated by the engine (`FuzzTable`).
 */
export function driveGame(options: DriveOptions, visit: (table: FuzzTable, actorId: PlayerId) => void): FuzzTable {
  const table =
    options.start === "rich"
      ? FuzzTable.fromState(richStartState(options.seed, options.playerCount), options.seed)
      : FuzzTable.create(options.seed, options.playerCount);
  const chooser = new SeededRandom(options.chooserSeed ?? options.seed * 31 + 7);
  const maxCommands = options.maxCommands ?? 2000;
  let commands = 0;
  while (table.state.phase.type !== "finished") {
    if (commands >= maxCommands) {
      throw new Error(`seed ${options.seed} did not finish within ${maxCommands} commands`);
    }
    const prompt = decisionPrompt(table.state);
    const actorId = prompt.actorIds[prompt.actorIds.length <= 1 ? 0 : chooser.nextInt(prompt.actorIds.length)];
    if (actorId === undefined) {
      throw new Error(`no actor in ${table.state.phase.type}`);
    }
    visit(table, actorId);
    const view = table.view(actorId);
    let command: AuthoritativeCommand;
    if (table.state.phase.type === "firing_contributions") {
      const options = legalCommands(view, { mode: "canonical" }) as SubmitContributionCommand[];
      const chosen = options[options.length <= 1 ? 0 : chooser.nextInt(options.length)];
      if (chosen === undefined || validateContribution(view, table.privateState, chosen) !== null) {
        throw new Error(`no legal Contribution for ${actorId}`);
      }
      command = chosen;
    } else {
      command = sampleLegalAction(view, chooser, { weights: DIRECTED_WEIGHTS });
    }
    table.apply(actorId, command, `seed ${options.seed}`);
    commands += 1;
  }
  visit(table, table.state.playerOrder[0] as PlayerId);
  return table;
}

/**
 * The reviewed key set of `FiringStageView` (owner decisions D3, D4). A new key fails
 * `firingStageKeyViolations` until it is reviewed against D3 and added here.
 */
export const FIRING_STAGE_KEYS = {
  view: [
    "round",
    "step",
    "firstPlayerOrder",
    "queue",
    "submittedPlayerIds",
    "kilnDie",
    "contributions",
    "baseHeat",
    "fireModifier",
    "globalHeat",
    "fireDiscard",
    "testPieces",
    "extraFire",
    "ceramics",
  ],
  queue: ["actorIds", "index"],
  contribution: ["playerId", "revealed"],
  revealed: ["card", "heat", "woodPaid"],
  testPieces: ["playerId", "peeked", "buried"],
  extraFire: ["playerId", "ceramicId", "modifier"],
  ceramic: ["id", "ownerId", "kiln", "spaceId", "marker", "quality", "crackle", "salvaged", "secondFireModifier"],
  /** `CeramicHeatMarker`: `value` only once turned. */
  marker: ["source", "faceDown", "value"],
} as const;

/** Heat-calculation, preview and deck vocabulary that must never reach the firing stage. */
export const FORBIDDEN_FIRING_KEYS: readonly string[] = [
  "actualHeat",
  "finalActualHeat",
  "heatSource",
  "heatDifference",
  "positionModifier",
  "positionSource",
  "junAdjustment",
  "heatMarker",
  "preferredHeat",
  "heatBeforeFire",
  "qualityByFire",
  "fireDeck",
  "first",
  "second",
  "history",
  "calculation",
  "unclampedBaseHeat",
  "pendingExtraFire",
  "participantIds",
  "firingPlayerIds",
];

function exactKeys(where: string, value: unknown, allowed: readonly string[], out: string[], optional: readonly string[] = []): void {
  if (value === null || typeof value !== "object") {
    out.push(`${where} is not an object`);
    return;
  }
  const keys = Object.keys(value);
  for (const key of keys) {
    if (!allowed.includes(key)) {
      out.push(`${where} has unreviewed key "${key}"`);
    }
  }
  for (const key of allowed) {
    if (!keys.includes(key) && !optional.includes(key)) {
      out.push(`${where} lacks "${key}"`);
    }
  }
}

/** Every key of a `FiringStageView` outside the reviewed allow-list, and any forbidden key. */
export function firingStageKeyViolations(stage: FiringStageView): string[] {
  const out: string[] = [];
  const k = FIRING_STAGE_KEYS;
  exactKeys("view", stage, k.view, out);
  if (stage.queue !== null) exactKeys("queue", stage.queue, k.queue, out);
  stage.contributions.forEach((c, i) => {
    exactKeys(`contributions[${i}]`, c, k.contribution, out);
    if (c.revealed !== null) exactKeys(`contributions[${i}].revealed`, c.revealed, k.revealed, out);
  });
  stage.testPieces.forEach((t, i) => exactKeys(`testPieces[${i}]`, t, k.testPieces, out));
  if (stage.extraFire !== null) exactKeys("extraFire", stage.extraFire, k.extraFire, out);
  stage.ceramics.forEach((c, i) => {
    exactKeys(`ceramics[${i}]`, c, k.ceramic, out);
    if (c.marker !== null) exactKeys(`ceramics[${i}].marker`, c.marker, k.marker, out, ["value"]);
  });
  const walk = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, `${path}[${i}]`));
    } else if (value !== null && typeof value === "object") {
      for (const [key, inner] of Object.entries(value)) {
        if (FORBIDDEN_FIRING_KEYS.includes(key)) out.push(`${path}.${key} is forbidden (D3/D4)`);
        walk(inner, `${path}.${key}`);
      }
    }
  };
  walk(stage, "view");
  return out;
}

// ── Option-list agreement for the production-UI selectors (§5 gaps 8, 10–12, 14–16) ────────

/** Every well-formed load destination (the candidates `loadDestinationOptions` filters). */
export function everyDestination(): Array<LoadSpec["destination"]> {
  const destinations: Array<LoadSpec["destination"]> = [];
  for (const spaceId of KILN_SPACE_IDS) {
    destinations.push({ kiln: "shared", spaceId });
    destinations.push({ kiln: "shared", spaceId, invertedFiring: true });
    for (const kilnFurniture of TECHS.T15.params.modifiers) {
      destinations.push({ kiln: "shared", spaceId, kilnFurniture });
    }
  }
  for (const imperialModifier of FIRING.imperialModifiers) {
    destinations.push({ kiln: "imperial", imperialModifier });
  }
  return destinations;
}

type MaterialsYardAction = Extract<GameAction, { type: "PLACE_MATERIALS_YARD" }>;

/** Every Materials Yard command for a worker option (any split, Prepared Clay), validated:
 * the exhaustive oracle of `materialsYardOptions` (v1.6.2 L164–165: no Shifu Coin option). */
export function legalMaterialsYardCommands(view: ActorView, worker: PlacementWorkerOption): MaterialsYardAction[] {
  const total = LOCATIONS.materials_yard.effects[worker.effect].resources;
  const prepared: Array<MaterialsYardAction["preparedClay"]> = [undefined];
  for (const shape of SHAPES) for (const decoration of DECORATIONS) prepared.push({ shape, decoration });
  const legal: MaterialsYardAction[] = [];
  for (const preparedClay of prepared) {
    for (let clay = 0; clay <= total; clay += 1) {
      const action: MaterialsYardAction = {
        type: "PLACE_MATERIALS_YARD",
        workerId: worker.workerId,
        clay,
        wood: total - clay,
        ...(worker.seniorApprentice ? { seniorApprentice: true } : {}),
        ...(preparedClay === undefined ? {} : { preparedClay }),
      };
      if (validateAction(view, action) === null) legal.push(action);
    }
  }
  return legal;
}

function sameSet<T>(a: readonly T[], b: readonly T[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((x) => right.has(x));
}

/**
 * Every place where the production-UI option selectors disagree with `validateAction` for
 * `actorId` in this state (exhaustive probes, not the canonical enumeration). Empty when they
 * agree.
 */
export function uiOptionAgreementViolations(state: GameState, privateState: PrivateFiringState | null, actorId: PlayerId): string[] {
  const out: string[] = [];
  const view = actorViewOf(state, actorId, privateState);
  const game = view.game;
  const phase = game.phase;
  const check = (condition: boolean, message: string) => {
    if (!condition) out.push(message);
  };
  const ok = (action: GameAction) => validateAction(view, action) === null;

  // Gap 10: the printed effect records, copied.
  for (const locationId of LOCATION_IDS) {
    for (const effect of ["apprentice", "shifu"] as const) {
      const limits = placementLimits(view, locationId, effect);
      check(JSON.stringify(limits) === JSON.stringify(LOCATIONS[locationId].effects[effect]), `placementLimits ${locationId}/${effect} differs from content`);
    }
  }

  // Gap 11: "Added by ⟨Tech⟩".
  for (const pid of game.playerOrder) {
    const p = player(game, pid);
    for (const space of playerSummary(view, pid).personalSpaces) {
      const expected = space.spaceIndex === 1 && space.unlocked ? (p.techs.find((t) => TECHS[t.id].unlocks === space.locationId)?.id ?? null) : null;
      check(space.addedByTechId === expected, `${pid} ${space.locationId}[${space.spaceIndex}] addedByTechId=${space.addedByTechId} expected ${expected}`);
      if (space.spaceIndex === 1 && space.unlocked) check(space.addedByTechId !== null, `${pid} ${space.locationId}[1] is added without a Tech`);
    }
  }

  // Gap 12: the error behind every reason, with its details.
  const options = placementOptions(view);
  for (const option of options) {
    for (const worker of option.workers) {
      check(worker.legal === (worker.error === null), `${option.locationId}/${worker.workerId} legal=${worker.legal} error=${worker.error?.code}`);
      check(worker.reason === (worker.error?.code ?? null), `${option.locationId}/${worker.workerId} reason ${worker.reason} vs error ${worker.error?.code}`);
      if (option.locationId === "magistrates_hall" || option.locationId === "canal_wharf") {
        const type = option.locationId === "magistrates_hall" ? "PLACE_MAGISTRATES_HALL" : "PLACE_CANAL_WHARF";
        check(JSON.stringify(worker.error) === JSON.stringify(validateAction(view, { type, workerId: worker.workerId })), `${option.locationId}/${worker.workerId} error differs from the validator's`);
      }
    }
  }

  const work = phase.type === "work_turn" && phase.activePlayerId === actorId;
  if (work && phase.step.kind === "before_action") {
    // Gap 14: Materials Yard, exhaustive.
    for (const worker of options.find((o) => o.locationId === "materials_yard")?.workers.filter((w) => w.legal) ?? []) {
      const listed = materialsYardOptions(view, worker);
      const legal = legalMaterialsYardCommands(view, worker);
      const tag = `materialsYardOptions ${worker.workerId}${worker.seniorApprentice ? "+senior" : ""}`;
      check(legal.length > 0, `${tag}: a legal worker with no legal command`);
      check(legal.every((a) => a.clay + a.wood === listed.resources), `${tag}: resources ${listed.resources}`);
      const prepared = legal.flatMap((a) => (a.preparedClay === undefined ? [] : [a.preparedClay]));
      check(sameSet(listed.preparedClay?.shapes ?? [], prepared.map((p) => p.shape)), `${tag}: Prepared Clay Shapes ${listed.preparedClay?.shapes.join(",")} vs ${[...new Set(prepared.map((p) => p.shape))].join(",")}`);
      check(sameSet(listed.preparedClay?.decorations ?? [], prepared.map((p) => p.decoration)), `${tag}: Prepared Clay Decorations disagree`);
      // Legality is per pair (Shape Clay comes from the split): compare the exact pairs, not
      // only the two projections.
      const key = (p: { shape: Shape; decoration: Decoration }): string => `${p.shape}/${p.decoration}`;
      check(sameSet((listed.preparedClay?.pairs ?? []).map(key), prepared.map(key)), `${tag}: Prepared Clay pairs disagree`);
      const t17 = techReady(player(game, actorId), "T17");
      check((listed.preparedClay === null) === (worker.seniorApprentice || !t17), `${tag}: preparedClay null=${listed.preparedClay === null}`);
    }

    // Gap 15: Glaze & Load vessels, Glazes and rework Shapes, for one load and after a first.
    const loader = options.find((o) => o.locationId === "glaze_load")?.workers.find((w) => w.legal && w.effect === "shifu") ??
      options.find((o) => o.locationId === "glaze_load")?.workers.find((w) => w.legal);
    if (loader !== undefined) {
      const verify = (earlier: LoadSpec[]): LoadSpec | null => {
        const listed = glazeLoadVesselOptions(view, actorId, earlier);
        const used = new Set(earlier.map((l) => l.ceramicId));
        check(sameSet(listed.map((o) => o.ceramicId), ceramicsOf(game, actorId, "shaped").filter((c) => !used.has(c.id)).map((c) => c.id)), "glazeLoadVesselOptions lists the wrong vessels");
        let witness: LoadSpec | null = null;
        for (const option of listed) {
          const works = (load: Omit<LoadSpec, "destination">): LoadSpec | null => {
            for (const destination of everyDestination()) {
              const spec = { ...load, destination } as LoadSpec;
              if (ok({ type: "PLACE_GLAZE_LOAD", workerId: loader.workerId, loads: [...earlier, spec] })) return spec;
            }
            return null;
          };
          const plain = works({ ceramicId: option.ceramicId, glaze: "white" });
          const reworkable = SHAPES.filter((shape) => works({ ceramicId: option.ceramicId, glaze: "white", reworkShape: shape }) !== null);
          check(sameSet(option.reworkShapes, reworkable), `glazeLoadVesselOptions ${option.ceramicId} reworkShapes [${option.reworkShapes.join(",")}] vs [${reworkable.join(",")}]`);
          const any = plain ?? (reworkable[0] === undefined ? null : works({ ceramicId: option.ceramicId, glaze: "white", reworkShape: reworkable[0] }));
          for (const glaze of GLAZES) {
            const legal = any !== null && ok({ type: "PLACE_GLAZE_LOAD", workerId: loader.workerId, loads: [...earlier, { ...any, glaze }] });
            check(option.glazes.includes(glaze) === legal, `glazeLoadVesselOptions ${option.ceramicId} glaze ${glaze} listed=${option.glazes.includes(glaze)} ok=${legal}`);
          }
          witness ??= plain;
        }
        return witness;
      };
      const first = verify([]);
      if (first !== null && LOCATIONS.glaze_load.effects[loader.effect].maxLoads >= 2) verify([first]);
    }
  }

  // Gap 16: Imperial Priority, every candidate (in every phase: unusable lists nothing).
  const priority = imperialPriorityOptions(view);
  check(sameSet(priority.ceramics.map((c) => c.ceramicId), priority.ceramicIds), "imperialPriorityOptions ceramics and ceramicIds differ");
  for (const vessel of ceramicsOf(game, actorId, "shaped")) {
    const listed = priority.ceramics.find((c) => c.ceramicId === vessel.id);
    for (const glaze of GLAZES) {
      for (const imperialModifier of FIRING.imperialModifiers) {
        for (const reworkShape of [undefined, ...SHAPES]) {
          const legal = ok({ type: "USE_IMPERIAL_PRIORITY", ceramicId: vessel.id, glaze, imperialModifier, ...(reworkShape === undefined ? {} : { reworkShape }) });
          const offered =
            listed !== undefined &&
            listed.glazes.includes(glaze) &&
            listed.imperialModifiers.includes(imperialModifier) &&
            (reworkShape === undefined || listed.reworkShapes.includes(reworkShape));
          check(legal === offered, `imperialPriorityOptions ${vessel.id} ${glaze}/${imperialModifier}/${reworkShape ?? "-"} offered=${offered} ok=${legal}`);
        }
      }
    }
  }

  // Gap 8: Crackle declaration verdicts against COMPLETE_ORDER / USE_CANAL_BARGE in their windows.
  const type =
    phase.type === "orders" && decisionPrompt(game).actorIds.includes(actorId)
      ? ("COMPLETE_ORDER" as const)
      : canalBargeOptions(view).length > 0
        ? ("USE_CANAL_BARGE" as const)
        : null;
  if (type !== null) {
    for (const orderId of view.own.orderHand) {
      for (const match of orderMatchOptions(view, orderId, 4)) {
        const hasCrackle = match.ceramicIds.some((id) => {
          const c = lookup(game.ceramics, id);
          return c !== undefined && c.stage === "finished" && c.crackle;
        });
        if (!hasCrackle) continue;
        const checks = crackleDeclarationChecks(view, orderId, match.ceramicIds, match.crackleDeclarations);
        const verdict = (declarations?: CrackleDeclaration[]) =>
          ok({ type, orderId, ceramicIds: match.ceramicIds, ...(declarations === undefined ? {} : { crackleDeclarations: declarations }) });
        check(checks.auto.ok === verdict(), `crackleDeclarationChecks ${orderId} auto=${checks.auto.ok}`);
        check(checks.declared.ok === verdict(match.crackleDeclarations), `crackleDeclarationChecks ${orderId} declared=${checks.declared.ok}`);
        check(checks.declared.ok, `crackleDeclarationChecks ${orderId}: the matcher's own declarations fail`);
        for (const ceramic of checks.ceramics) {
          for (const option of ceramic.options) {
            const others = match.crackleDeclarations.filter((d) => d.ceramicId !== ceramic.ceramicId);
            const declarations = option.decoration === null ? others : [...others, { ceramicId: ceramic.ceramicId, decoration: option.decoration }];
            check(option.check.ok === verdict(declarations), `crackleDeclarationChecks ${orderId} ${ceramic.ceramicId}=${option.decoration ?? "printed"} ok=${option.check.ok}`);
          }
        }
      }
    }
  }
  return out;
}

/** Scripted states aimed at the option selectors' edge cases (gaps 8, 14–16). */
export function uiOptionScenarios(): Array<{ name: string; table: LocalTable; actor: PlayerId }> {
  const work = (name: string, spec: StateSpec) => ({ name, table: new LocalTable(buildState(spec)), actor: "p1" });
  return [
    work("Materials Yard: Prepared Clay with 2 Coins and no Clay", {
      players: [{ techs: ["T17"], resources: { clay: 0, wood: 0, coins: 2 } }, {}],
    }),
    work("Materials Yard: Prepared Clay with 3 Coins and no Clay", {
      players: [{ techs: ["T17"], resources: { clay: 0, wood: 0, coins: 3 } }, {}],
    }),
    work("Materials Yard: Prepared Clay with no Coins", {
      players: [{ techs: ["T17"], resources: { clay: 0, wood: 0, coins: 0 } }, {}],
    }),
    work("Materials Yard: Senior Apprentice, Prepared Clay used", {
      players: [{ techs: ["T18"], resources: { coins: 5 } }, { techs: [{ id: "T17", usedThisRound: true }] }],
    }),
    work("Glaze & Load: Reworking Table, Kiln Furniture, Imperial Kiln, a Setter's Mark", {
      players: [{ techs: ["T05", "T15"], recognition: 2, resources: { coins: 6 } }, { techs: ["T22"] }, {}],
      ceramics: [
        { owner: "p1", stage: "shaped", shape: "bowl", decoration: "carved" },
        { owner: "p1", stage: "shaped", shape: "vase" },
        { owner: "p1", stage: "shaped", shape: "censer", decoration: "painted" },
        { owner: "p3", stage: "loaded", shape: "plate", glaze: "white", at: "middle_1" },
      ],
      settersMarks: { high_1: "p2" },
    }),
    work("Glaze & Load: Inverted Firing pairs onto an own ceramic", {
      players: [{ techs: ["T21"] }, {}],
      ceramics: [
        { owner: "p1", stage: "loaded", shape: "plate", glaze: "white", at: "middle_1" },
        { owner: "p1", stage: "shaped", shape: "bowl" },
        { owner: "p1", stage: "shaped", shape: "plate", decoration: "impressed" },
        { owner: "p1", stage: "shaped", shape: "vase" },
      ],
    }),
    work("Imperial Priority with Reworking Table", {
      players: [{ techs: ["T05"], recognition: 3 }, {}],
      ceramics: [
        { owner: "p1", stage: "shaped", shape: "bowl" },
        { owner: "p1", stage: "shaped", shape: "censer", decoration: "carved" },
      ],
    }),
    work("Imperial Priority with the Imperial Kiln full", {
      players: [{ recognition: 3 }, {}],
      ceramics: [
        { owner: "p1", stage: "loaded", shape: "vase", glaze: "celadon", at: "imperial", imperialModifier: -1 },
        { owner: "p1", stage: "shaped", shape: "bowl" },
      ],
    }),
    work("Canal Barge with a Crackle wildcard", {
      players: [{ kilnId: "GE", techs: ["T23"], hand: ["O39", "S11", "S13"] }, {}],
      ceramics: [
        { owner: "p1", stage: "finished", shape: "vase", glaze: "celadon", decoration: "plain", quality: "fine", crackle: true },
        { owner: "p1", stage: "finished", shape: "censer", glaze: "moon_white", decoration: "painted", quality: "fine" },
        { owner: "p1", stage: "finished", shape: "bowl", glaze: "white", decoration: "impressed", quality: "fine", crackle: true },
      ],
    }),
    {
      name: "Order Phase with two Crackle ceramics in one Order",
      table: new LocalTable(
        buildState({
          players: [{ kilnId: "GE", hand: ["O29", "S12", "O36"] }, {}],
          phase: { type: "orders", turnOrder: ["p1", "p2"], index: 0 },
          ceramics: [
            { owner: "p1", stage: "finished", shape: "vase", glaze: "moon_white", decoration: "plain", quality: "fine", crackle: true },
            { owner: "p1", stage: "finished", shape: "censer", glaze: "celadon", decoration: "plain", quality: "fine", crackle: true },
            { owner: "p1", stage: "finished", shape: "washer", glaze: "white", decoration: "plain", quality: "masterpiece" },
          ],
        }),
        { flow: "halt", pass: ["worker_action_done"] },
      ),
      actor: "p1",
    },
  ];
}
