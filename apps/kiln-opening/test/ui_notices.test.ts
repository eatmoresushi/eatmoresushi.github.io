import { describe, expect, it } from "vitest";
import type { CommandSuccess } from "../src/multiplayer";
import { imperialOrderNotice } from "../src/ui/App";

function resultWith(events: CommandSuccess["events"], progress: number): CommandSuccess {
  return {
    actorId: "P1",
    events,
    game: { players: { P1: { imperialProgress: progress } } },
  } as unknown as CommandSuccess;
}

describe("Imperial Order notifications", () => {
  it("reports a multi-ceramic Order's printed +2 reward and full jump", () => {
    const notice = imperialOrderNotice(resultWith([
      { type: "ORDER_COMPLETED", playerId: "P1", orderId: "I06", ceramicIds: ["C1", "C2"] },
      { type: "IMPERIAL_PROGRESS_ADVANCED", playerId: "P1", from: 1, to: 3, reward: 2 },
    ], 3));
    expect(notice).toContain("Player completed I06. +11 VP.");
    expect(notice).toContain("Imperial Progress +2: 1 → 3.");
    expect(notice).toContain("Court Examination reached.");
  });

  it("announces every milestone crossed by a 3 → 5 jump", () => {
    const notice = imperialOrderNotice(resultWith([
      { type: "ORDER_COMPLETED", playerId: "P1", orderId: "I08", ceramicIds: ["C1", "C2", "C3"] },
      { type: "IMPERIAL_PROGRESS_ADVANCED", playerId: "P1", from: 3, to: 5, reward: 2 },
      { type: "IMPERIAL_SEAL_CLAIMED", playerId: "P1" },
    ], 5));
    expect(notice).toContain("Imperial Progress +2: 3 → 5.");
    expect(notice).toContain("Awaiting Audience reached.");
    expect(notice).toContain("Imperial Audience reached.");
    expect(notice).toContain("You claim the Imperial Seal");
  });

  it("uses the authoritative stipend event amount in both languages", () => {
    const result = resultWith([
      { type: "ORDER_COMPLETED", playerId: "P1", orderId: "I06", ceramicIds: ["C1", "C2"] },
      { type: "IMPERIAL_PROGRESS_ADVANCED", playerId: "P1", from: 0, to: 2, reward: 2 },
      { type: "IMPERIAL_STIPEND_RECEIVED", playerId: "P1", space: 2, coins: 1 },
    ], 2);
    expect(imperialOrderNotice(result)).toContain("Court stipend +1 Coin");
    expect(imperialOrderNotice(result, "zh-CN")).toContain("朝廷赏赐+1铜钱");
  });
});
