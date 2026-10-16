/**
 * The game log dropdown (UI_V1.6.1_ARCHITECTURE §4.1, §8.1, §8.3, §9.2; D5; B1).
 *
 * - a disclosure button (`aria-expanded`, `aria-controls`) over a panel, at every width;
 * - newest first; the newest `LOG_PAGE` entries, then Show earlier;
 * - own secret lines marked "only you"; no foreign secret in any fixture's open log.
 */
import { describe, expect, it } from "vitest";
import type { PublicGameEvent } from "../../../../src/game/index.ts";
import { fixtureSnapshot } from "../../../../src/app/session/fixtureSource.ts";
import type { LogEntry } from "../../../../src/app/session/gameSource.ts";
import { GameLog, LOG_PAGE } from "../../../../src/app/shell/GameLog.tsx";
import { allFixtures, fixture, fixtureSource, secretIds } from "../support/fixtures.ts";
import { renderComponent } from "../support/render.tsx";
import { StaticSource, attr, perceivable } from "./support.tsx";

const entries = (html: string): string[] => [...html.matchAll(/<li class="game-log-entry"[^>]*><span class="game-log-text">([^<]*)<\/span>/g)].map((match) => match[1] ?? "");

/** m1 with a long log: `count` work turns, oldest first. */
function longLog(count: number): StaticSource {
  const snapshot = fixtureSnapshot(structuredClone(fixture("m1_work_phase_r2_3p")));
  const players = snapshot.view!.game.playerOrder;
  const log: LogEntry[] = Array.from({ length: count }, (_, index) => ({
    sequence: index + 1,
    revision: index + 1,
    actorId: players[index % players.length]!,
    event: { type: "WORK_TURN_STARTED", playerId: players[index % players.length]! } satisfies PublicGameEvent,
  }));
  log.push({ sequence: count + 1, revision: count + 1, actorId: players[0]!, event: { type: "KILN_DIE_ROLLED", round: 2, value: 3 } });
  return new StaticSource({ ...snapshot, log });
}

describe("game log", () => {
  it("is a closed disclosure by default", () => {
    const html = renderComponent(fixtureSource("m1_work_phase_r2_3p"), <GameLog />);
    const button = /<button[^>]*class="game-log-button"[^>]*>/.exec(html)?.[0] ?? "";
    expect(attr(button, "aria-expanded")).toBe("false");
    expect(attr(button, "aria-label")).toBe("Game log");
    const panel = attr(button, "aria-controls");
    expect(html).toMatch(new RegExp(`<div id="${panel}" class="game-log-panel" role="region" aria-labelledby="[^"]+" hidden="">`));
    expect(entries(html)).toEqual([]);
  });

  it("lists the newest entries first when open", () => {
    const snapshot = fixtureSnapshot(structuredClone(fixture("m1_work_phase_r2_3p")));
    const html = renderComponent(fixtureSource("m1_work_phase_r2_3p"), <GameLog />, { ui: { logOpen: true } });
    const lines = entries(html);
    expect(lines).toHaveLength(snapshot.log.length);
    expect(html).toMatch(/aria-expanded="true"/);
    expect(html).toContain("newest first");
    expect(html).not.toMatch(/class="game-log-panel"[^>]*hidden/);
    // The newest entry (highest sequence) comes first.
    const html2 = renderComponent(longLog(3), <GameLog />, { ui: { logOpen: true } });
    expect(entries(html2)[0]).toBe("Kiln Die rolled: 3");
  });

  it("caps the list at one page and offers Show earlier", () => {
    const html = renderComponent(longLog(LOG_PAGE + 10), <GameLog />, { ui: { logOpen: true } });
    expect(entries(html)).toHaveLength(LOG_PAGE);
    expect(html).toContain(">Show earlier</button>");
    const short = renderComponent(longLog(LOG_PAGE - 10), <GameLog />, { ui: { logOpen: true } });
    expect(entries(short)).toHaveLength(LOG_PAGE - 9);
    expect(short).not.toContain("Show earlier");
  });

  it("folds an Order reward's Coins into the completion line and ends the turn truthfully", () => {
    const snapshot = fixtureSnapshot(structuredClone(fixture("m1_work_phase_r2_3p")));
    const player = snapshot.view!.game.playerOrder[0]!;
    const name = snapshot.view!.game.players[player]!.displayName;
    const events: PublicGameEvent[] = [
      { type: "ORDER_TURN_STARTED", playerId: player },
      {
        type: "ORDER_COMPLETED",
        playerId: player,
        record: { orderId: "S04", ceramicIds: [], round: 2, via: "order_phase", vp: 3, coins: 5, printedCrowns: 0, bonusCrowns: 0, crackleDeclarations: [], kilnAbility: null },
      },
      { type: "RESOURCES_CHANGED", playerId: player, clay: 0, wood: 0, coins: 5, reason: "order_reward" },
      { type: "ORDER_TURN_ENDED", playerId: player, automatic: true },
    ];
    const log: LogEntry[] = events.map((event, index) => ({ sequence: index + 1, revision: index + 1, actorId: player, event }));
    const lines = entries(renderComponent(new StaticSource({ ...snapshot, log }), <GameLog />, { ui: { logOpen: true } }));
    expect(lines).toEqual([
      `${name} has no more Orders to complete`,
      `${name} completed S04: +3 VP, +5 Coins`,
      `Order Phase: ${name}’s turn`,
    ]);
    expect(lines.join(" ")).not.toContain("Order reward");
  });

  it("says when nothing has happened", () => {
    const snapshot = fixtureSnapshot(structuredClone(fixture("w-kiln-selection")));
    const html = renderComponent(new StaticSource({ ...snapshot, log: [] }), <GameLog />, { ui: { logOpen: true } });
    expect(html).toContain("Nothing has happened yet.");
    expect(renderComponent(new StaticSource({ ...snapshot, log: [] }), <GameLog />, { ui: { logOpen: true }, locale: "zh-CN" })).toContain("还没有记录。");
  });

  it("marks the viewer's own secret lines and shows only theirs", () => {
    const html = renderComponent(fixtureSource("m2_commission_market_look_r3_4p"), <GameLog />, { ui: { logOpen: true } });
    expect(html).toMatch(/<li class="game-log-entry" data-own="">[^]*?only you/);
    expect(html).toContain("Zhao looked at O39, O20, O14");
  });

  it.each(allFixtures().map((entry) => [entry.id] as const))("%s: the open log shows no foreign secret or internal ID", (id) => {
    for (const locale of ["en", "zh-CN"] as const) {
      const html = renderComponent(fixtureSource(id), <GameLog />, { ui: { logOpen: true }, locale });
      for (const secret of secretIds(id)) expect(html, `secret ${secret}`).not.toMatch(new RegExp(`\\b${secret}\\b`));
      const seen = perceivable(html);
      expect(seen).not.toMatch(/\bc\d+\b/);
      expect(seen).not.toMatch(/\bp\d+(:|\b)/);
      expect(seen).not.toMatch(/[{}]/);
    }
  });
});
