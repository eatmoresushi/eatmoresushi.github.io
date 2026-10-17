/**
 * The UI fixtures are current and private (UI_V1.6.1_ARCHITECTURE.md §9.1).
 *
 * - `scenarios.json` is regenerated in memory (a few tens of milliseconds) and must match the
 *   checked-in file byte for byte, and `secrets.json` must hold the same scenario oracle.
 * - `moments.json` is played by the strategic computer policy, too slow for every run: each
 *   moment must carry the current rules fingerprint, its recorded `decisionPrompt` must still
 *   follow from its view, and its recomputed canonical commands must still validate.
 *   `npm run fixtures:check` regenerates everything and byte-diffs (a phase-exit gate).
 * - Privacy: every entry passes `tools/fixturePrivacy.ts` and holds none of its secret IDs;
 *   own secrets are allowed only under `ownSecrets[i].event` for the viewer; negative tests
 *   plant foreign secrets and expect failures.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  actorViewOf,
  afterQualityOptions,
  completableOrders,
  contributionOptions,
  decisionPrompt,
  firingStageView,
  legalCommands,
  playerSummary,
  rulesFingerprint,
  validateAction,
} from "../../../src/game/index.ts";
import type { ActorView, GameEvent, GamePhaseType, PlayerView, SubmitContributionCommand } from "../../../src/game/index.ts";
import { phaseScenarios } from "../engine/phase_scenarios.ts";
import {
  entryPrivacyProblems,
  entryStructureProblems,
  verifyFixtureEntries,
  type PrivacyCheckedEntry,
} from "../../../tools/fixturePrivacy.ts";
import { TEST_FIXTURE_FILES, buildScenarioFixtures, scenariosFile, serializeFixture, type UiFixtureEntry } from "../../../tools/uiFixtures.ts";

interface FixtureFile {
  rulesVersion: string;
  rulesFingerprint: string;
  entries: UiFixtureEntry[];
}

const scenariosText = readFileSync(TEST_FIXTURE_FILES.scenarios, "utf8");
const scenarios = JSON.parse(scenariosText) as FixtureFile;
const moments = JSON.parse(readFileSync(TEST_FIXTURE_FILES.moments, "utf8")) as FixtureFile & { policy: string };
const secrets = (JSON.parse(readFileSync(TEST_FIXTURE_FILES.secrets, "utf8")) as { entries: Record<string, string[]> }).entries;
const all: UiFixtureEntry[] = [...scenarios.entries, ...moments.entries];

function actorView(entry: UiFixtureEntry): ActorView {
  const view = entry.playerView;
  if (view.own === null || view.viewerId === null) throw new Error(`${entry.id} has no seated viewer`);
  return { viewerId: view.viewerId, game: view.game, own: view.own };
}

describe("scenarios.json is current", () => {
  const built = buildScenarioFixtures();

  it("regenerates byte for byte", () => {
    expect(JSON.parse(serializeFixture(scenariosFile(built.entries)))).toEqual(scenarios);
    expect(serializeFixture(scenariosFile(built.entries)) === scenariosText).toBe(true);
  });

  it("secrets.json holds the same scenario oracle", () => {
    for (const entry of built.entries) {
      expect(secrets[entry.id], entry.id).toEqual(built.secrets[entry.id]);
    }
  });
});

describe("moments.json is current", () => {
  it("was recorded under the current rules fingerprint", () => {
    expect(moments.rulesFingerprint).toBe(rulesFingerprint());
    expect(scenarios.rulesFingerprint).toBe(rulesFingerprint());
  });

  it.each(moments.entries.map((m) => [m.id, m] as const))("%s: the recorded decision prompt still follows from the view", (_id, entry) => {
    expect(decisionPrompt(entry.playerView.game)).toEqual(entry.decisionPrompt);
    expect(entry.viewerActs).toBe(entry.playerView.game.phase.type !== "finished" && entry.decisionPrompt.actorIds.includes(entry.viewerId));
  });

  it.each(all.filter((e) => e.viewerActs).map((e) => [e.id, e] as const))("%s: the viewer's canonical commands still validate", (_id, entry) => {
    const view = actorView(entry);
    const commands = legalCommands(view, { mode: "canonical" });
    expect(commands.length).toBeGreaterThan(0);
    for (const command of commands) {
      if (command.type === "SUBMIT_CONTRIBUTION") {
        const option = contributionOptions(view).find((o) => o.command.card === command.card && o.command.fuelLedger === command.fuelLedger);
        expect(option?.affordable, JSON.stringify(command)).toBe(true);
      } else {
        expect(validateAction(view, command), JSON.stringify(command)).toBeNull();
      }
    }
  });

  it("m1: the viewer's second Form & Decorate space was added by a Form & Decorate Tech (D7, §5 gap 11)", () => {
    const m1 = moments.entries.find((e) => e.id === "m1_work_phase_r2_3p");
    expect(m1).toBeDefined();
    if (m1 === undefined) return;
    const spaces = playerSummary(m1.playerView, m1.viewerId).personalSpaces;
    // V1.6.2's seed-1 game: Senior Apprentice (T18), a Form & Decorate Tech, added it.
    expect(spaces.find((s) => s.locationId === "form_decorate" && s.spaceIndex === 1)?.addedByTechId).toBe("T18");
    expect(spaces.find((s) => s.locationId === "glaze_load" && s.spaceIndex === 1)).toMatchObject({ unlocked: false, addedByTechId: null });
  });

  it("m19–m23 are played moments of the V1.6.2 windows the owner reviews in the gallery", () => {
    const moment = (id: string) => {
      const entry = moments.entries.find((e) => e.id === id);
      if (entry === undefined) throw new Error(`no moment ${id}`);
      expect(entry.source.kind, id).toBe("played");
      expect(entry.viewerActs, id).toBe(true);
      return entry;
    };
    const step = (id: string) => {
      const phase = moment(id).playerView.game.phase;
      return phase.type === "work_turn" ? phase.step : null;
    };
    expect(step("m19_commission_apprentice_look")).toMatchObject({ kind: "commission_market", effect: "apprentice", lookSize: 2, lookedCount: 2 });
    const look = moment("m19_commission_apprentice_look").playerView.own?.pendingLook;
    expect(look?.kind === "commission_market" && look.orderIds).toHaveLength(2);
    expect(step("m20_colour_samples_swap_look")).toMatchObject({ kind: "colour_samples_swap", lookedCount: 2 });
    expect(step("m21_guild_shifu_second_take")).toMatchObject({ kind: "guild_inspection", takes: [expect.anything()] });
    const saggars = moment("m22_saggars_upgrade");
    expect(afterQualityOptions(saggars.playerView).find((o) => o.ability === "protective_saggars")?.ceramicIds.length).toBeGreaterThan(0);
    // S07 completable, and the viewer's Canal Barge pays on this first completion of the round.
    const s07 = completableOrders(moment("m23_order_phase_s07").playerView).find((m) => m.orderId === "S07");
    expect(s07?.triggers.canalBarge).toBe(true);
  });

  it("the R7 scenario and moment m18 show Second Firing's 2 revealed cards while the choice is open (§5 gap 7, v1.6.2 L631)", () => {
    for (const id of ["w-second-firing-choice-with-jun-r7", "m18_jun_second_firing"]) {
      const entry = all.find((e) => e.id === id);
      expect(entry, id).toBeDefined();
      if (entry === undefined) continue;
      expect(entry.playerView.game.phase.type, id).toBe("firing_second_firing_choice");
      const stage = firingStageView(entry.playerView);
      expect(stage?.extraFire?.modifiers, id).toHaveLength(2);
      // Not chosen yet: the ceramic records no second card.
      expect(stage?.ceramics.find((c) => c.id === stage.extraFire?.ceramicId)?.secondFireModifier, id).toBeNull();
    }
  });
});

describe("coverage", () => {
  it("has unique IDs, one oracle entry per fixture and the documented kinds", () => {
    const ids = all.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(secrets).sort()).toEqual([...ids].sort());
    expect(scenarios.entries.every((e) => e.kind === "window" || e.kind === "table")).toBe(true);
    expect(moments.entries.every((e) => e.kind === "moment")).toBe(true);
    expect(scenarios.entries.filter((e) => e.kind === "window").every((e) => e.viewerActs)).toBe(true);
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]) {
      expect(moments.entries.some((e) => e.id.startsWith(`m${n}_`)), `m${n}`).toBe(true);
    }
    for (const id of ["m10a", "m10b", "m11a", "m11b"]) expect(moments.entries.some((e) => e.id.startsWith(`${id}_`)), id).toBe(true);
  });

  it("reaches every engine phase, every Work step, a waiting viewer and 2- and 4-player finals", () => {
    const phases = new Set<GamePhaseType>(all.map((e) => e.playerView.game.phase.type));
    const expected: GamePhaseType[] = [
      "setup_kiln_selection",
      "round_start_setters_mark",
      "work_turn",
      "firing_contributions",
      "firing_test_pieces",
      "firing_heat_markers",
      "firing_heat_adjustment",
      "firing_after_quality",
      "firing_second_firing_choice",
      "firing_salvage",
      "orders",
      "cleanup_hand_limit",
      "finished",
    ];
    expect([...phases].sort()).toEqual([...expected].sort());
    const steps = new Set<string>();
    for (const e of all) {
      const phase = e.playerView.game.phase;
      if (phase.type === "work_turn") steps.add(phase.step.kind === "commission_market" ? `commission_market:${phase.step.effect}` : phase.step.kind);
      if (phase.type === "firing_test_pieces") steps.add(`test_pieces:${phase.awaiting}`);
    }
    expect([...steps].sort()).toEqual(
      [
        "after_action",
        "before_action",
        "colour_samples",
        "colour_samples_swap",
        "commission_market:apprentice",
        "commission_market:shifu",
        "guild_inspection",
        "test_pieces:bury",
        "test_pieces:decision",
      ].sort(),
    );
    expect(all.some((e) => !e.viewerActs && e.playerView.game.phase.type !== "finished")).toBe(true);
    // V1.6.2's regenerated moments end a 4-player game (m8, seed 2); the finals cover 2 and 4.
    const finals = all.filter((e) => e.playerView.game.phase.type === "finished").map((e) => e.playerView.game.playerCount);
    expect(finals).toEqual(expect.arrayContaining([2, 4]));
    expect(all.some((e) => e.playerView.game.finalResult !== null && e.playerView.game.finalResult.resolvedBy !== "total_vp")).toBe(true);
  });
});

describe("privacy (§9.1)", () => {
  it("every entry passes the structural rules and holds none of its secret IDs", () => {
    expect(verifyFixtureEntries(all, secrets)).toEqual([]);
  });

  it("own secrets are the viewer's own and appear where the viewer was shown something", () => {
    for (const entry of all) {
      for (const record of entry.ownSecrets) {
        expect((record.event as { secret?: { visibleTo: string } }).secret?.visibleTo, entry.id).toBe(entry.viewerId);
      }
    }
    const types = (id: string) => all.find((e) => e.id === id)?.ownSecrets.map((r) => r.event.type) ?? [];
    expect(types("w-commission-market-shifu-top-3-look-2-reservations")).toContain("PRIVATE_LOOK_OPENED");
    expect(types("w-test-pieces-bury")).toContain("TEST_PIECES_PEEKED");
    expect(types("m11b_test_pieces_bury")).toContain("TEST_PIECES_PEEKED");
    expect(types("m12_guild_shifu_inspection")).toContain("PRIVATE_LOOK_OPENED");
  });

  const withOwnSecret = (): UiFixtureEntry => {
    const entry = all.find((e) => e.ownSecrets.length > 0);
    if (entry === undefined) throw new Error("no entry with own secrets");
    return structuredClone(entry);
  };

  it("rejects an own secret visible to another seat", () => {
    const entry = withOwnSecret();
    const record = entry.ownSecrets[0];
    if (record === undefined) throw new Error("unreachable");
    const other = entry.playerView.game.playerOrder.find((pid) => pid !== entry.viewerId) ?? "p9";
    (record.event as unknown as { secret: { visibleTo: string } }).secret.visibleTo = other;
    expect(entryStructureProblems(entry).join("\n")).toMatch(/visible to/);
  });

  it("rejects a secret payload outside ownSecrets[i].event", () => {
    const entry = withOwnSecret();
    const secret = entry.ownSecrets[0]?.event;
    entry.recentPublicEvents.push({ sequence: 999, revision: 0, actorId: entry.viewerId, event: secret as never });
    expect(entryStructureProblems(entry).join("\n")).toMatch(/outside ownSecrets/);
    const planted = structuredClone(entry) as UiFixtureEntry & { extra?: unknown };
    planted.extra = { secret: { visibleTo: entry.viewerId } };
    expect(entryStructureProblems(planted).join("\n")).toMatch(/outside ownSecrets/);
  });

  it("rejects a secret ID anywhere in an entry", () => {
    const entry = structuredClone(all.find((e) => e.id === "m2_commission_market_look_r3_4p") ?? all[0]) as UiFixtureEntry;
    const id = secrets[entry.id]?.[0];
    expect(id).toBeDefined();
    entry.notes.push(`leak ${id}`, id ?? "");
    expect(verifyFixtureEntries([entry], secrets).join("\n")).toMatch(/secret/);
  });

  it("rejects another seat's private look or a tampered own secret, against the authoritative state", () => {
    const scenario = phaseScenarios().find((s) => s.name === "Commission Market: Shifu top-3 look, 2 reservations");
    if (scenario === undefined) throw new Error("scenario missing");
    const table = scenario.table;
    const events: GameEvent[] = table.events;
    const lookIndex = events.findIndex((e) => e.type === "PRIVATE_LOOK_OPENED");
    const look = events[lookIndex];
    expect(look).toBeDefined();
    if (look === undefined) return;
    const record = { sequence: lookIndex + 1, revision: table.state.revision, actorId: scenario.actor, event: structuredClone(look) };
    const onlooker = table.state.playerOrder.find((pid) => pid !== scenario.actor) ?? "p2";
    const view: PlayerView = actorViewOf(table.state, onlooker, table.privateState);
    const foreign: PrivacyCheckedEntry = { id: "planted", viewerId: onlooker, playerView: view, recentPublicEvents: [], ownSecrets: [record] };
    const problems = entryPrivacyProblems(table.state, table.privateState, foreign, events).join("\n");
    expect(problems).toMatch(/visible to|not one of/);
    expect(problems).toMatch(/private look/);
    // The actor's own secret is fine as recorded, and fails once tampered with.
    const ownView = actorViewOf(table.state, scenario.actor, table.privateState);
    const own: PrivacyCheckedEntry = { id: "own", viewerId: scenario.actor, playerView: ownView, recentPublicEvents: [], ownSecrets: [record] };
    expect(entryPrivacyProblems(table.state, table.privateState, own, events)).toEqual([]);
    const tampered = structuredClone(own);
    const payload = (tampered.ownSecrets[0]?.event as unknown as { secret: { orderIds: string[] } }).secret;
    payload.orderIds = [...payload.orderIds].reverse();
    expect(entryPrivacyProblems(table.state, table.privateState, tampered, events).join("\n")).toMatch(/differs from the authoritative event/);
  });

  it("never seals another seat's Contribution in a fixture", () => {
    const step1 = all.filter((e) => e.playerView.game.phase.type === "firing_contributions");
    expect(step1.length).toBeGreaterThan(0);
    for (const entry of step1) {
      const phase = entry.playerView.game.phase;
      if (phase.type !== "firing_contributions") continue;
      const sealed = entry.playerView.own?.pendingContribution ?? null;
      expect(sealed === null || phase.submittedPlayerIds.includes(entry.viewerId)).toBe(true);
      for (const record of entry.recentPublicEvents) {
        if (record.event.type === "CONTRIBUTION_SUBMITTED") expect(Object.keys(record.event).sort()).toEqual(["playerId", "type", "windowId"]);
      }
    }
    const options = contributionOptions(actorView(step1[0] as UiFixtureEntry)).map((o): SubmitContributionCommand => o.command);
    expect(options.length).toBeGreaterThan(0);
  });
});
