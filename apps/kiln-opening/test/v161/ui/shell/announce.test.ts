/**
 * Live announcements (UI_V1.6.1_ARCHITECTURE §8.3, §9.2; B1): `announcementFor` is pure.
 *
 * - each batch of any origin is summarised through the event templates; a computer batch names
 *   who moved; long batches keep the most recent lines and count the rest;
 * - someone else's private look is said once when it opens;
 * - becoming an actor is said last, with the window's own sentence;
 * - messages are stored as `RichMessage`s, so they re-render in either language.
 */
import { describe, expect, it } from "vitest";
import type { PublicGameEvent } from "../../../../src/game/index.ts";
import { createTranslator } from "../../../../src/app/i18n/translator.ts";
import type { RichMessage } from "../../../../src/app/i18n/translator.ts";
import type { EventBatch } from "../../../../src/app/session/gameSource.ts";
import { ANNOUNCED_EVENTS, MAX_ANNOUNCED_LINES, announcementFor, yourTurnMessage } from "../../../../src/app/shell/announce.ts";
import type { GameModel } from "../../../../src/app/state/model.ts";
import { modelOf } from "./support.tsx";

const en = createTranslator("en", { strict: true });
const zh = createTranslator("zh-CN", { strict: true });
const say = (messages: readonly RichMessage[] | undefined, t = en): string[] => (messages ?? []).map((message) => t.message(message));

function batch(events: PublicGameEvent[], origin: EventBatch["origin"] = "remote"): EventBatch {
  return { revision: 99, firstSequence: 500, events, origin };
}

describe("announcementFor", () => {
  it("says the viewer's turn when a window opens, with the workers left", () => {
    const model = modelOf("m1_work_phase_r2_3p");
    const left = model.me!.availableWorkerIds.length;
    const result = announcementFor(model, null, null);
    expect(say(result?.polite)).toEqual([`Your turn: place a worker. ${left} ${left === 1 ? "worker" : "workers"} left.`]);
    expect(say(result?.polite, zh)).toEqual([`轮到你了：派工。你还有${left}名工人。`]);
  });

  it("says nothing new when the same window stays open", () => {
    const model = modelOf("m1_work_phase_r2_3p");
    expect(announcementFor(model, null, model)).toBeNull();
  });

  it("has a sentence for every acting window and none for waiting", () => {
    const acting = ["w-kiln-selection", "w-setters-mark-window", "m1_work_phase_r2_3p", "w-commission-market-top-3-choice", "w-guild-hall-shifu-inspection", "w-colour-samples-choice", "m9_contributions_step1_3p", "m11a_test_pieces_decision", "m3_heat_marker_step_3p", "m13_jun_heat_adjustment", "m4_after_quality_3p", "m14_salvage", "m6_order_phase_crackle_3p", "m7_cleanup_hand_limit_3p"];
    for (const id of acting) {
      const message = yourTurnMessage(modelOf(id));
      expect(message, id).not.toBeNull();
      expect(en.message(message!)).toMatch(/^(Your turn|Cleanup): /);
      expect(zh.message(message!)).toMatch(/^(轮到你了|收工)：/);
    }
    expect(yourTurnMessage(modelOf("m10b_setters_mark_on_space"))).toBeNull();
    expect(yourTurnMessage(modelOf("t-final-2p"))).toBeNull();
  });

  it("says the hand trim with the limit", () => {
    const model = modelOf("m7_cleanup_hand_limit_3p");
    const status = model.handLimits[model.viewerId!]!;
    expect(en.message(yourTurnMessage(model)!)).toBe(`Cleanup: discard ${status.mustDiscard} ${status.mustDiscard === 1 ? "Order" : "Orders"} to reach your limit of ${status.limit}.`);
  });

  it("summarises a batch through the event templates, your turn last", () => {
    const model = modelOf("m1_work_phase_r2_3p");
    const previous = modelOf("m10b_setters_mark_on_space");
    const [lin] = model.players.filter((player) => player.playerId !== model.viewerId);
    const result = announcementFor(model, batch([
      { type: "WORKER_PLACED", playerId: lin!.playerId, workerId: "w", kind: "apprentice", locationId: "canal_wharf", spaceIndex: 0, effect: "apprentice", viaSeniorApprentice: false },
      { type: "WORK_TURN_ENDED", playerId: lin!.playerId, automatic: false },
    ]), previous);
    const lines = say(result?.polite);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(`${lin!.displayName} placed their Apprentice at Canal Wharf.`);
    expect(lines[1]).toMatch(/^Your turn: place a worker\./);
  });

  it("names the computer players who moved", () => {
    const model = modelOf("m1_work_phase_r2_3p", { computerPlayerIds: ["p1", "p2"] });
    const result = announcementFor(model, batch([
      { type: "WORKER_PLACED", playerId: "p1", workerId: "w", kind: "shifu", locationId: "guild_hall", spaceIndex: 0, effect: "shifu", viaSeniorApprentice: false },
      { type: "WORKER_PLACED", playerId: "p2", workerId: "w", kind: "apprentice", locationId: "materials_yard", spaceIndex: 0, effect: "apprentice", viaSeniorApprentice: false },
    ], "computers"), model);
    const name = (id: string) => model.players.find((player) => player.playerId === id)!.displayName;
    expect(say(result?.polite)).toEqual([
      `${name("p1")}, ${name("p2")} moved: ${name("p1")} placed their Shifu at Guild Hall; ${name("p2")} placed their Apprentice at Materials Yard.`,
    ]);
    expect(say(result?.polite, zh)[0]).toMatch(new RegExp(`^${name("p1")}、${name("p2")}已行动：`));
  });

  it("keeps the most recent lines of a long batch and counts the rest", () => {
    const model = modelOf("m1_work_phase_r2_3p");
    const events: PublicGameEvent[] = Array.from({ length: MAX_ANNOUNCED_LINES + 3 }, () => ({ type: "CONTRIBUTION_SUBMITTED", playerId: "p1", windowId: "w" }));
    const text = say(announcementFor(model, batch(events), model)?.polite)[0] ?? "";
    expect(text.startsWith("and 3 more; ")).toBe(true);
    expect(text.split("; ")).toHaveLength(MAX_ANNOUNCED_LINES + 1);
  });

  it("skips bookkeeping events", () => {
    const model = modelOf("m1_work_phase_r2_3p");
    expect(ANNOUNCED_EVENTS.has("ACTUAL_HEAT_CALCULATED")).toBe(false);
    expect(announcementFor(model, batch([{ type: "WORK_TURN_STARTED", playerId: "p1" }, { type: "ABILITIES_READIED", round: 2 }]), model)).toBeNull();
  });

  it("says someone else's private look once, never the cards", () => {
    const viewer = modelOf("m2_commission_market_look_r3_4p");
    // The same table, seen by another seat: the look is someone else's.
    const other = viewer.players.find((player) => player.playerId !== viewer.viewerId)!;
    const asOther: GameModel = { ...viewer, viewerId: other.playerId, viewerActs: false };
    const look = viewer.board.counts.pendingLook!;
    const lines = say(announcementFor(asOther, null, null)?.polite);
    const looker = viewer.players.find((player) => player.playerId === look.playerId)!.displayName;
    expect(lines).toContain(`${looker} is looking at ${look.count} Orders.`);
    for (const id of viewer.look?.orderIds ?? []) expect(lines.join(" ")).not.toContain(id);
    expect(announcementFor(asOther, null, asOther)).toBeNull();
    // The viewer's own look is not announced as someone else's.
    expect(say(announcementFor(viewer, null, null)?.polite).join(" ")).not.toContain("is looking at");
  });

  it("says the game is over once", () => {
    const model = modelOf("t-final-2p");
    const result = say(announcementFor(model, null, null)?.polite);
    const winners = model.finalResult!.winnerIds.map((id) => model.players.find((player) => player.playerId === id)!.displayName).join(", ");
    expect(result[0]).toMatch(new RegExp(`^Game over\\. (Winner|Shared victory): ${winners}, \\d+ VP\\.$`));
    expect(announcementFor(model, null, model)).toBeNull();
  });
});
