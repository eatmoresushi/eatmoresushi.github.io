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
  "w-kiln-and-main-order-choice": "kiln_selection",
  "w-setters-mark-window": "setters_mark",
  "w-before-the-worker-action-rich-4-player-start": "work",
  "w-before-the-worker-action-colour-samples-swap-imperial-priority-with-reworking-table-ding": "work",
  "w-before-the-worker-action-kiln-furniture-inverted-firing-targets-setters-marks-senior-apprentice": "work",
  "w-before-the-worker-action-kiln-master-at-loading-the-magistrates-hall-shifus-crown-order-the-kiln-fuel": "work",
  "w-commission-market-shifu-top-3-look-2-reservations": "commission",
  "w-commission-market-apprentice-top-2-look-1-reservation": "commission",
  "w-guild-hall-shifu-inspection": "guild_inspection",
  "w-colour-samples-choice": "colour_samples",
  "w-colour-samples-swap-look": "colour_samples_swap",
  "w-after-the-worker-action": "work",
  "w-secret-contributions-with-fuel-ledger": "contributions",
  "w-test-pieces-decision": "test_pieces",
  "w-test-pieces-bury": "test_pieces",
  "w-jun-heat-adjustment": "jun",
  "w-after-quality-saggars-and-ge": "after_quality",
  "w-second-firing-choice-with-jun-r7": "second_firing",
  "w-order-phase-sell-a-flawed-ceramic": "orders",
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
  "t-colour-samples-select-face-up": "work",
  "t-fuel-ledger-reveal": "waiting",
  "t-after-quality-sale": "after_quality",
  "t-work-turn-sale": "work",
  "t-cleanup-sale": "hand_limit",
  m1_work_phase_r2_3p: "work",
  m2_commission_market_look_r3_4p: "commission",
  m3_kiln_master_marker_3p: "jun",
  m4_after_quality_3p: "after_quality",
  m5_two_player_board_2p: "work",
  m6_order_phase_crackle_3p: "orders",
  m7_cleanup_hand_limit_3p: "hand_limit",
  m8_final_results_3p: "final",
  m9_contributions_step1_3p: "contributions",
  m10a_setters_mark_window: "setters_mark",
  m10b_setters_mark_on_space: "work",
  m11a_test_pieces_decision: "test_pieces",
  m11b_test_pieces_bury: "test_pieces",
  m12_guild_shifu_inspection: "guild_inspection",
  m13_jun_heat_adjustment: "jun",
  m14_sell_flawed: "orders",
  m15_kiln_selection: "kiln_selection",
  m16_colour_samples: "colour_samples",
  m17_after_action: "work",
  m18_jun_second_firing: "second_firing",
  m19_commission_apprentice_look: "commission",
  m20_colour_samples_swap_look: "colour_samples_swap",
  m21_guild_shifu_second_take: "guild_inspection",
  m22_saggars_upgrade: "after_quality",
  m23_order_phase_s07: "orders",
  m24_glaze_load_fuel_kiln_master: "work",
  m25_magistrates_hall_crown_order: "work",
  m26_ge_crackle_fine: "after_quality",
  m27_crackle_vp_completion: "orders",
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

  it("names Second Firing's choice and its ceramic; Jun is firing step 3 only (rev. 4 L627, L661)", () => {
    const view = fixture("w-second-firing-choice-with-jun-r7").playerView;
    const window = decisionWindow(view);
    expect(window.kind).toBe("second_firing");
    const phase = view.game.phase as { ceramicId: string };
    expect(window.kind === "second_firing" && window.ceramicId).toBe(phase.ceramicId);
    expect(window.openKey).toContain(phase.ceramicId);
    const step3 = decisionWindow(fixture("w-jun-heat-adjustment").playerView);
    expect(step3.kind).toBe("jun");
  });

  it("carries the Commission Market step's Select: N, the reservation limit, the display (v1.6.2 L64, L201–202, change 25)", () => {
    const shifu = decisionWindow(fixture("w-commission-market-shifu-top-3-look-2-reservations").playerView);
    expect(shifu.kind === "commission" && [shifu.effect, shifu.select.n, shifu.select.maxReservations, shifu.select.fromDisplay]).toEqual(["shifu", 3, 2, true]);
    const apprentice = decisionWindow(fixture("w-commission-market-apprentice-top-2-look-1-reservation").playerView);
    expect(apprentice.kind === "commission" && [apprentice.effect, apprentice.select.n, apprentice.select.maxReservations, apprentice.select.fromDisplay]).toEqual(["apprentice", 2, 1, true]);
  });

  it("carries Colour Samples' Select 3 when acquired and in its swap, each with the display (v1.6.2 L622, change 25)", () => {
    const acquired = decisionWindow(fixture("w-colour-samples-choice").playerView);
    expect(acquired.kind === "colour_samples" && acquired.select).toEqual({ n: 3, maxReservations: 1, fromDisplay: true, lookedCount: 3 });
    const swap = decisionWindow(fixture("w-colour-samples-swap-look").playerView);
    expect(swap.kind === "colour_samples_swap" && swap.select).toEqual({ n: 3, maxReservations: 1, fromDisplay: true, lookedCount: 3 });
  });

  it("carries the played V1.6.2 moments' steps: the Apprentice's Select 2, a second Guild Hall take, the swap's Select 3 (v1.6.2 L201, L207, L622)", () => {
    const look = decisionWindow(fixture("m19_commission_apprentice_look").playerView);
    expect(look.kind === "commission" && [look.effect, look.select.n, look.select.maxReservations, look.select.lookedCount]).toEqual(["apprentice", 2, 1, 2]);
    const second = decisionWindow(fixture("m21_guild_shifu_second_take").playerView);
    expect(second.kind === "guild_inspection" && second.takes).toBe(1);
    expect(second.openKey).toMatch(/:t1$/);
    const swap = decisionWindow(fixture("m20_colour_samples_swap_look").playerView);
    expect(swap.kind === "colour_samples_swap" && [swap.returnTo, swap.select.n, swap.select.lookedCount]).toEqual(["before_action", 3, 3]);
  });

  it("names the step the Colour Samples swap returns to", () => {
    const view = fixture("w-colour-samples-swap-look").playerView;
    const window = decisionWindow(view);
    const step = (view.game.phase as { step: { returnTo: string } }).step;
    expect(window.kind === "colour_samples_swap" && window.returnTo).toBe(step.returnTo);
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
    // The hand trim is the only parallel window since revision 4 (the salvage step is gone).
    expect(decisionWindow(fixture("w-cleanup-hand-limit").playerView).mode).toBe("parallel");
    expect(decisionWindow(fixture("w-order-phase-sell-a-flawed-ceramic").playerView).mode).toBe("single");
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

  it("use openedAtRevision for the hand trim", () => {
    for (const id of ["w-cleanup-hand-limit", "m7_cleanup_hand_limit_3p"]) {
      const view = fixture(id).playerView;
      const phase = view.game.phase as { openedAtRevision: number };
      const reopened: PlayerView = { ...view, game: { ...view.game, phase: { ...view.game.phase, openedAtRevision: phase.openedAtRevision + 7 } as typeof view.game.phase } };
      expect(key(reopened), id).not.toBe(key(view));
    }
  });

  it("use the queue index for queued firing steps and the Setter's Mark", () => {
    for (const id of ["w-jun-heat-adjustment", "w-after-quality-saggars-and-ge", "w-test-pieces-decision", "w-setters-mark-window"]) {
      const view = fixture(id).playerView;
      const phase = view.game.phase as { queue: { actorIds: string[]; index: number } };
      const moved: PlayerView = { ...view, game: { ...view.game, phase: { ...view.game.phase, queue: { ...phase.queue, index: phase.queue.index + 1 } } as typeof view.game.phase } };
      expect(key(moved), id).not.toBe(key(view));
    }
  });

  it("separate the Test Pieces decision from its bury step", () => {
    expect(key(fixture("w-test-pieces-decision").playerView)).not.toBe(key(fixture("w-test-pieces-bury").playerView));
  });

  it("use the selection index for the Setup choice", () => {
    const view = fixture("w-kiln-and-main-order-choice").playerView;
    const phase = view.game.phase as { index: number };
    const next: PlayerView = { ...view, game: { ...view.game, phase: { ...view.game.phase, index: phase.index + 1 } as typeof view.game.phase } };
    expect(key(next)).not.toBe(key(view));
  });

  it("change with each Guild Hall take, so the second take starts from a fresh draft", () => {
    const view = fixture("w-guild-hall-shifu-inspection").playerView;
    const phase = view.game.phase as Extract<PlayerView["game"]["phase"], { type: "work_turn" }>;
    const step = phase.step as Extract<typeof phase.step, { kind: "guild_inspection" }>;
    const taken: PlayerView = { ...view, game: { ...view.game, phase: { ...phase, step: { ...step, takes: [...step.takes, { kind: "face_up", techId: "T01" }] } } } };
    expect(key(taken)).not.toBe(key(view));
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
