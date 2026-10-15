/**
 * `FixtureGameSource` (UI plan §3.1, §9.1): a read-only source over one JSON fixture. It
 * checks a submitted command the way ConfirmBar does and records it, and never changes the
 * view. Exercised over the signed-off wireframe moments (`docs/ui-v1.6.1/fixtures.json`);
 * A1's `scenarios.json` / `moments.json` share the entry shape.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { contributionOptions, decisionPrompt, legalCommands } from "../../../../src/game/index.ts";
import type { AuthoritativeCommand } from "../../../../src/game/index.ts";
import { FixtureGameSource, checkCommand, fixtureSnapshot } from "../../../../src/app/session/fixtureSource.ts";
import type { FixtureEntry } from "../../../../src/app/session/fixtureSource.ts";

const file = fileURLToPath(new URL("../../../../docs/ui-v1.6.1/fixtures.json", import.meta.url));
const moments = (JSON.parse(readFileSync(file, "utf8")) as { moments: FixtureEntry[] }).moments;

describe("FixtureGameSource", () => {
  it("has moments to read", () => {
    expect(moments.length).toBeGreaterThanOrEqual(9);
  });

  for (const moment of moments) {
    it(`${moment.id}: builds a seated snapshot from the fixture alone`, () => {
      const snapshot = fixtureSnapshot(moment, { computerPlayerIds: [moment.playerView.game.playerOrder.at(-1) ?? ""] });
      const game = moment.playerView.game;
      expect(snapshot.view).toBe(moment.playerView);
      expect(snapshot.seat?.playerId).toBe(moment.viewerId);
      expect(snapshot.seats.map((seat) => seat.playerId)).toEqual(game.playerOrder);
      expect(snapshot.seats.map((seat) => seat.displayName)).toEqual(game.playerOrder.map((pid) => game.players[pid]?.displayName));
      expect(snapshot.seats.at(-1)?.isComputer).toBe(true);
      expect(snapshot.room?.status).toBe(game.phase.type === "finished" ? "finished" : "playing");
      expect(snapshot.room?.latestRevision).toBe(game.revision);
      const sequences = snapshot.log.map((entry) => entry.sequence);
      expect(sequences).toEqual([...sequences].sort((a, b) => a - b));
      expect(snapshot.log).toHaveLength(moment.recentPublicEvents?.length ?? 0);
      expect(snapshot.lastBatch).toBeNull();
      expect(Object.isFrozen(snapshot)).toBe(true);
    });
  }

  it("records a legal command without changing the view, and rejects an illegal one with a rule error", async () => {
    const acting = moments.filter((moment) => decisionPrompt(moment.playerView.game).actorIds.includes(moment.viewerId));
    expect(acting.length).toBeGreaterThan(3);
    for (const moment of acting) {
      const source = new FixtureGameSource(moment);
      const before = source.getSnapshot();
      let notified = 0;
      source.subscribe(() => {
        notified += 1;
      });
      const [legal] = legalCommands(moment.playerView, { mode: "canonical", limit: 1 });
      expect(legal, moment.id).toBeDefined();
      const outcome = await source.submit(legal as AuthoritativeCommand);
      expect(outcome, moment.id).toEqual({ kind: "recorded", command: legal });
      expect(source.getSnapshot().view).toBe(before.view);
      expect(source.getServerSnapshot()).toBe(source.getSnapshot());

      const illegal = { type: "END_TURN" } as AuthoritativeCommand;
      if (checkCommand(moment.playerView, illegal) !== null) {
        const rejected = await source.submit(illegal);
        expect(rejected.kind).toBe("rejected");
        expect(source.getSnapshot().status.error?.kind).toBe("rule");
        expect(source.getSnapshot().view).toBe(before.view);
      }
      expect(source.submissions()[0]).toEqual({ command: legal, error: null });
      expect(notified).toBeGreaterThan(0);
      expect(await source.resend()).toEqual({ kind: "ignored" });
    }
  });

  it("checks a Contribution by contributionOptions affordability", async () => {
    const moment = moments.find((candidate) => candidate.playerView.game.phase.type === "firing_contributions");
    expect(moment).toBeDefined();
    const view = moment!.playerView;
    const options = contributionOptions(view);
    expect(options.length).toBeGreaterThan(0);
    const source = new FixtureGameSource(moment!);
    for (const option of options) {
      const outcome = await source.submit(option.command);
      expect(outcome.kind).toBe(option.affordable ? "recorded" : "rejected");
    }
    const phase = view.game.phase;
    if (phase.type !== "firing_contributions") throw new Error("Expected the Contribution window");
    const wrongWindow = await source.submit({ type: "SUBMIT_CONTRIBUTION", windowId: "nope", card: "TEND", fuelLedger: false });
    expect(wrongWindow).toMatchObject({ kind: "rejected", error: { kind: "rule", error: { code: "INVALID_CONTRIBUTION" } } });
  });

  it("carries shell-state status for the gallery", () => {
    const moment = moments[0]!;
    const snapshot = fixtureSnapshot(moment, { status: { reconnecting: true, connection: "offline" }, roomStatus: "abandoned" });
    expect(snapshot.status).toMatchObject({ reconnecting: true, connection: "offline", sending: false });
    expect(snapshot.room?.status).toBe("abandoned");
  });
});
