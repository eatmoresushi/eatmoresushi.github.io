/**
 * `decisionWindow` (UI_V1.6.1_ARCHITECTURE §3.4, §3.5): every scenario and moment maps to the
 * expected window kind, every kind is reached, and open keys change exactly when a window opens
 * anew.
 */
import { describe, expect, it } from "vitest";
import type { PlayerView } from "../../../../src/game/index.ts";
import { DECISION_WINDOW_KINDS, decisionWindow, isActingWindow, windowDraftKey } from "../../../../src/app/state/decisionWindow.ts";
import type { DecisionWindowKind } from "../../../../src/app/state/decisionWindow.ts";
import { allFixtures, fixture } from "../support/fixtures.ts";

/** The window each fixture opens for its viewer. */
const EXPECTED: Record<string, DecisionWindowKind> = {
  "w-kiln-selection": "kiln_selection",
  "w-setters-mark-window": "setters_mark",
  "w-before-the-worker-action-rich-4-player-start": "work",
  "w-before-the-worker-action-canal-barge-imperial-priority-with-reworking-table-ding": "work",
  "w-before-the-worker-action-kiln-furniture-inverted-firing-targets-setters-marks-senior-apprentice": "work",
  "w-commission-market-second-reservation-or-stop": "commission",
  "w-commission-market-top-3-choice": "commission",
  "w-commission-market-resource-after-a-blind-reservation": "commission",
  "w-guild-hall-shifu-inspection": "guild_inspection",
  "w-colour-samples-choice": "colour_samples",
  "w-after-the-worker-action": "work",
  "w-secret-contributions-with-fuel-ledger": "contributions",
  "w-test-pieces-decision": "test_pieces",
  "w-test-pieces-bury": "test_pieces",
  "w-heat-marker-step-with-a-face-down-marker-and-kiln-master": "heat_markers",
  "w-jun-heat-adjustment": "jun",
  "w-after-quality-saggars-and-ge": "after_quality",
  "w-jun-during-second-firing-r7": "jun",
  "w-salvage": "salvage",
  "w-order-phase-with-ru-tribute-ware-and-a-crackle-wildcard": "orders",
  "w-cleanup-hand-limit": "hand_limit",
  "t-firing-skipped": "waiting",
  "t-imperial-only-firing": "waiting",
  "t-fire-deck-reshuffle": "waiting",
  "t-empty-main-supply": "work",
  "t-round5-over-limit": "orders",
  "t-tie-break-winner": "final",
  "t-recognition-overflow": "waiting",
  "t-final-2p": "final",
  "t-final-4p": "final",
  "t-glaze-load-imperial-furniture": "work",
  m1_work_phase_r2_3p: "work",
  m2_commission_market_look_r3_4p: "commission",
  m3_heat_marker_step_3p: "heat_markers",
  m4_after_quality_3p: "after_quality",
  m5_two_player_board_2p: "work",
  m6_order_phase_crackle_3p: "orders",
  m7_cleanup_hand_limit_3p: "hand_limit",
  m8_final_results_3p: "final",
  m9_contributions_step1_3p: "contributions",
  m10a_setters_mark_window: "setters_mark",
  m10b_setters_mark_on_space: "waiting",
  m11a_test_pieces_decision: "test_pieces",
  m11b_test_pieces_bury: "test_pieces",
  m12_guild_shifu_inspection: "guild_inspection",
  m13_jun_heat_adjustment: "jun",
  m14_salvage: "salvage",
  m15_kiln_selection: "kiln_selection",
  m16_colour_samples: "colour_samples",
  m17_after_action: "work",
  m18_jun_second_firing: "jun",
};

/** A view of another seat at the same table (`own` cleared: what a spectator would see). */
function asSpectator(view: PlayerView): PlayerView {
  return { viewerId: null, game: view.game, own: null };
}

describe("decisionWindow", () => {
  it.each(allFixtures().map((entry) => [entry.id, entry] as const))("%s opens the expected window", (id, entry) => {
    const window = decisionWindow(entry.playerView);
    expect(window.kind).toBe(EXPECTED[id]);
    expect(isActingWindow(window)).toBe(entry.viewerActs === true);
    expect(window.phaseType).toBe(entry.playerView.game.phase.type);
  });

  it("knows every fixture", () => {
    expect(new Set(Object.keys(EXPECTED))).toEqual(new Set(allFixtures().map((entry) => entry.id)));
  });

  it("reaches every window kind", () => {
    const reached = new Set(allFixtures().map((entry) => decisionWindow(entry.playerView).kind));
    expect([...reached].sort()).toEqual([...DECISION_WINDOW_KINDS].sort());
  });

  it("tells the before-action and after-action work steps apart", () => {
    const before = decisionWindow(fixture("m1_work_phase_r2_3p").playerView);
    const after = decisionWindow(fixture("m17_after_action").playerView);
    expect(before.kind === "work" && before.step).toBe("before_action");
    expect(after.kind === "work" && after.step).toBe("after_action");
  });

  it("names the R7 Jun window and its ceramic", () => {
    const window = decisionWindow(fixture("w-jun-during-second-firing-r7").playerView);
    expect(window.kind === "jun" && window.during).toBe("second_firing");
    expect(window.kind === "jun" && window.ceramicId).toMatch(/^c\d+$/);
    const step8 = decisionWindow(fixture("w-jun-heat-adjustment").playerView);
    expect(step8.kind === "jun" && step8.during).toBe("heat_adjustment");
  });

  it("shows a spectator the waiting window, and a finished game the final window", () => {
    expect(decisionWindow(asSpectator(fixture("m1_work_phase_r2_3p").playerView)).kind).toBe("waiting");
    expect(decisionWindow(asSpectator(fixture("t-final-2p").playerView)).kind).toBe("final");
  });

  it("carries the prompt's actors and mode", () => {
    const contributions = decisionWindow(fixture("w-secret-contributions-with-fuel-ledger").playerView);
    expect(contributions.mode).toBe("simultaneous_secret");
    expect(contributions.actorIds).toEqual(["p1", "p2"]);
    expect(contributions.kind === "contributions" && contributions.windowId).toBe(
      (fixture("w-secret-contributions-with-fuel-ledger").playerView.game.phase as { windowId: string }).windowId,
    );
    expect(decisionWindow(fixture("w-salvage").playerView).mode).toBe("parallel");
  });
});

describe("open keys (§3.5)", () => {
  const key = (view: PlayerView) => windowDraftKey(decisionWindow(view));

  it("are stable across revisions of the same window", () => {
    const view = fixture("m9_contributions_step1_3p").playerView;
    const later: PlayerView = { ...view, game: { ...view.game, revision: view.game.revision + 1 } };
    expect(key(later)).toBe(key(view));
  });

  it("use the Contribution windowId", () => {
    const view = fixture("m9_contributions_step1_3p").playerView;
    const phase = view.game.phase as { windowId: string };
    const next: PlayerView = { ...view, game: { ...view.game, phase: { ...view.game.phase, windowId: `${phase.windowId}-next` } as typeof view.game.phase } };
    expect(key(next)).not.toBe(key(view));
  });

  it("use openedAtRevision for Salvage and the hand trim", () => {
    for (const id of ["w-salvage", "w-cleanup-hand-limit"]) {
      const view = fixture(id).playerView;
      const phase = view.game.phase as { openedAtRevision: number };
      const reopened: PlayerView = { ...view, game: { ...view.game, phase: { ...view.game.phase, openedAtRevision: phase.openedAtRevision + 7 } as typeof view.game.phase } };
      expect(key(reopened), id).not.toBe(key(view));
    }
  });

  it("use the queue index for queued firing steps and the Setter's Mark", () => {
    for (const id of ["w-heat-marker-step-with-a-face-down-marker-and-kiln-master", "w-jun-heat-adjustment", "w-after-quality-saggars-and-ge", "w-test-pieces-decision", "w-setters-mark-window"]) {
      const view = fixture(id).playerView;
      const phase = view.game.phase as { queue: { actorIds: string[]; index: number } };
      const moved: PlayerView = { ...view, game: { ...view.game, phase: { ...view.game.phase, queue: { ...phase.queue, index: phase.queue.index + 1 } } as typeof view.game.phase } };
      expect(key(moved), id).not.toBe(key(view));
    }
  });

  it("separate the Test Pieces decision from its bury step", () => {
    expect(key(fixture("w-test-pieces-decision").playerView)).not.toBe(key(fixture("w-test-pieces-bury").playerView));
  });

  it("use the selection index for Kiln selection", () => {
    const view = fixture("w-kiln-selection").playerView;
    const phase = view.game.phase as { index: number };
    const next: PlayerView = { ...view, game: { ...view.game, phase: { ...view.game.phase, index: phase.index + 1 } as typeof view.game.phase } };
    expect(key(next)).not.toBe(key(view));
  });

  it("change between work turns and between the steps of one turn", () => {
    const view = fixture("m1_work_phase_r2_3p").playerView;
    const pid = view.viewerId!;
    const player = view.game.players[pid]!;
    const [firstFree] = Object.values(player.workers).filter((worker) => worker.placement === null);
    const placed: PlayerView = {
      ...view,
      game: {
        ...view.game,
        players: {
          ...view.game.players,
          [pid]: { ...player, workers: { ...player.workers, [firstFree!.id]: { ...firstFree!, placement: { locationId: "canal_wharf", effect: "apprentice", viaSeniorApprentice: false, spaceIndex: 0, sequence: 99 } } } },
        },
      } as PlayerView["game"],
    };
    expect(key(placed)).not.toBe(key(view));
    const afterAction: PlayerView = { ...view, game: { ...view.game, phase: { type: "work_turn", activePlayerId: pid, step: { kind: "after_action" } } } };
    expect(key(afterAction)).not.toBe(key(view));
  });
});
