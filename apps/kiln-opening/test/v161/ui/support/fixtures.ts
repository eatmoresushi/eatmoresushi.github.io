/**
 * The UI fixture loader (UI_V1.6.1_ARCHITECTURE §9.1, §9.2). Created by A2; owned by B6 after
 * phase A.
 *
 * Reads A1's generated `test/v161/ui/fixtures/{scenarios,moments,secrets}.json` with
 * `readFileSync` (never imported by `src/app`), once per test process.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FixtureEntry, FixtureSourceOptions } from "../../../../src/app/session/fixtureSource.ts";
import { FixtureGameSource } from "../../../../src/app/session/fixtureSource.ts";

const DIR = join(import.meta.dirname, "../fixtures");

export interface UiFixture extends FixtureEntry {
  id: string;
  kind?: string;
  name?: string;
  title?: string;
  description?: string;
  viewerActs?: boolean;
  /** Which file it came from. */
  file: "scenarios" | "moments";
}

function load(file: "scenarios" | "moments"): UiFixture[] {
  const parsed = JSON.parse(readFileSync(join(DIR, `${file}.json`), "utf8")) as { entries: FixtureEntry[] };
  return parsed.entries.map((entry) => ({ ...entry, file }));
}

let cache: { scenarios: UiFixture[]; moments: UiFixture[] } | null = null;

function all(): { scenarios: UiFixture[]; moments: UiFixture[] } {
  cache ??= { scenarios: load("scenarios"), moments: load("moments") };
  return cache;
}

/** Every scripted scenario (`w-*` windows, `t-*` table states). */
export function scenarios(): readonly UiFixture[] {
  return all().scenarios;
}

/** Every played moment (`m1` … `m27`). */
export function moments(): readonly UiFixture[] {
  return all().moments;
}

/** Scenarios, then moments. */
export function allFixtures(): readonly UiFixture[] {
  return [...scenarios(), ...moments()];
}

/**
 * States no generated fixture captures, each derived from one by a small, rule-respecting edit
 * (`d-…`, tests only; never in `allFixtures()`, so coverage and currency checks see only the
 * generated set). Their secrets are the base fixture's.
 */
const DERIVED: Readonly<Record<string, { base: string; edit: (entry: UiFixture) => void }>> = {
  /** Before the worker action with the Colour Samples swap as the only ability that may come
   * first: the DING scenario after its Imperial Priority token was spent. */
  "d-colour-samples-swap-only": {
    base: "w-before-the-worker-action-colour-samples-swap-imperial-priority-with-reworking-table-ding",
    edit: (entry) => {
      const viewer = entry.playerView.game.players[entry.viewerId];
      if (viewer === undefined) throw new Error("no viewer");
      viewer.imperial.priority = "spent";
    },
  },
  /** The Guild Hall Shifu's inspection after a first take (a face-up Glazing & Loading Tech):
   * a second take of another discipline, or GUILD_FINISH with the 2 untaken inspected Techs. */
  "d-guild-hall-after-a-take": {
    base: "w-guild-hall-shifu-inspection",
    edit: (entry) => {
      const game = entry.playerView.game;
      const phase = game.phase;
      if (phase.type !== "work_turn" || phase.step.kind !== "guild_inspection") throw new Error("fixture changed");
      const techId = game.techDisplay.glazing_loading[0];
      const viewer = game.players[entry.viewerId];
      if (techId === undefined || viewer === undefined) throw new Error("fixture changed");
      game.techDisplay.glazing_loading = game.techDisplay.glazing_loading.slice(1);
      phase.step = { ...phase.step, takes: [{ kind: "face_up", techId }] };
      viewer.techs = [...viewer.techs, { id: techId, acquiredInRound: game.round, usedThisRound: false }];
    },
  },
  /** m2 right after the Shifu's SELECT_CHOOSE reserved display #1 (v1.6.2 L197): the position
   * stays empty until the turn ends, the 3 looked cards were discarded face down (owner ruling
   * R25), and the turn is in its after-action step. */
  "d-commission-after-face-up-reservation": {
    base: "m2_commission_market_look_r3_4p",
    edit: (entry) => {
      const view = entry.playerView;
      const game = view.game;
      const own = view.own;
      const phase = game.phase;
      const reserved = game.market.display[0];
      if (own === null || phase.type !== "work_turn" || reserved === null || reserved === undefined || own.pendingLook?.kind !== "commission_market") throw new Error("fixture changed");
      const looked = own.pendingLook.orderIds.length;
      game.market.display[0] = null;
      game.market.refillPendingFor = entry.viewerId;
      own.orderHand = [...own.orderHand, reserved];
      own.pendingLook = null;
      game.counts = {
        ...game.counts,
        mainDiscard: game.counts.mainDiscard + looked,
        pendingLook: null,
        orderHands: { ...game.counts.orderHands, [entry.viewerId]: own.orderHand.length },
      };
      phase.step = { kind: "after_action" };
    },
  },
  /** A shared victory (every tie-breaker equal): the 4-player final with its top two tied on
   * everything; the others ranked 3 and 4. */
  "d-final-shared-victory": {
    base: "t-final-4p",
    edit: (entry) => {
      const result = entry.playerView.game.finalResult;
      if (result === null) throw new Error("no final result");
      const order = [...result.standings].sort((a, b) => a.rank - b.rank);
      const [top, second, ...rest] = order;
      if (top === undefined || second === undefined || rest.length !== 2) throw new Error("not 4 players");
      result.scores[second.playerId] = structuredClone(result.scores[top.playerId]!);
      result.standings = [
        { ...structuredClone(top), rank: 1 },
        { ...structuredClone(top), playerId: second.playerId, rank: 1 },
        ...rest.map((standing, index) => ({ ...standing, rank: 3 + index })),
      ];
      result.winnerIds = [top.playerId, second.playerId];
      result.resolvedBy = "shared_victory";
    },
  },
};

export function fixture(id: string): UiFixture {
  const derived = DERIVED[id];
  if (derived !== undefined) {
    const entry = structuredClone(fixture(derived.base));
    derived.edit(entry);
    return { ...entry, id };
  }
  const found = allFixtures().find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`No UI fixture "${id}"`);
  return found;
}

/** A read-only source over one fixture (a fresh copy, so tests never share state). */
export function fixtureSource(id: string, options: FixtureSourceOptions = {}): FixtureGameSource {
  return new FixtureGameSource(structuredClone(fixture(id)), options);
}

/** The Order and Tech IDs one fixture's viewer must never see (`secrets.json`). */
/** The derived fixtures' IDs (`d-…`). */
export function derivedFixtureIds(): readonly string[] {
  return Object.keys(DERIVED);
}

export function secretIds(id: string): readonly string[] {
  const derived = DERIVED[id];
  if (derived !== undefined) return secretIds(derived.base);
  const parsed = JSON.parse(readFileSync(join(DIR, "secrets.json"), "utf8")) as Record<string, unknown>;
  const entries = (parsed["entries"] ?? parsed) as Record<string, unknown>;
  const value = entries[id];
  if (Array.isArray(value)) return value.map(String);
  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap((ids) => (Array.isArray(ids) ? ids.map(String) : []));
  }
  return [];
}
