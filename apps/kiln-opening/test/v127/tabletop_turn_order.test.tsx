import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { projectPublicGameState } from "../../src/multiplayer/index.ts";
import { LanguageProvider } from "../../src/ui/i18n.tsx";
import { TabletopGameExperience } from "../../src/ui/TabletopGameExperience.tsx";
import type { PublicGameState } from "../../src/multiplayer/index.ts";
import type { PlayerId } from "../../src/game/index.ts";
import { addFinished, addLoaded, startedGame, workerId } from "./helpers.ts";

function renderTable(game: PublicGameState): string {
  return renderToStaticMarkup(
    createElement(LanguageProvider, {
      initialLocale: "en",
      children: createElement(TabletopGameExperience, {
        game,
        ownPlayerId: "P1",
        ownPendingContribution: null,
        events: [],
        describeEvent: (record) => record.event.type,
        busy: false,
        send: async () => true,
      }),
    }),
  );
}

function turnOrderTrack(markup: string): string {
  const match = markup.match(
    /<(aside|section)[^>]*data-testid="turn-order-track"[^>]*>[\s\S]*?<\/\1>/,
  );
  expect(match, "the board should contain a semantic turn-order track").not.toBeNull();
  return match?.[0] ?? "";
}

function markerTags(track: string): string[] {
  return [...track.matchAll(/<[^>]*data-player-id="P[1-4]"[^>]*>/g)].map(([tag]) => tag);
}

describe("V1.2.7 tabletop turn-order presentation", () => {
  it("shows one colour-marker track in clockwise Work order from the First Player", () => {
    const state = structuredClone(startedGame(4, 12_690).state);
    state.firstPlayerId = "P3";
    state.phase = { type: "work", activePlayerId: "P4" };

    const track = turnOrderTrack(renderTable(projectPublicGameState(state)));
    const markers = markerTags(track);

    expect(track).toContain("TURN ORDER");
    expect(track).toContain("ORDER PHASE");
    expect(track).toContain("WORK PHASE");
    expect(markers).toHaveLength(4);
    expect(markers.map((tag) => tag.match(/data-player-id="([^"]+)"/)?.[1])).toEqual([
      "P3",
      "P4",
      "P1",
      "P2",
    ]);
    expect(markers[0]).toContain("kiln-tabletop-accent-ochre");
    expect(markers[1]).toContain("kiln-tabletop-accent-plum");
    expect(markers[2]).toContain("kiln-tabletop-accent-cinnabar");
    expect(markers[3]).toContain("kiln-tabletop-accent-river");
    expect(markers[1]).toContain('aria-current="step"');
    const firstMarker = track.match(/<li[^>]*data-player-id="P3"[^>]*>[\s\S]*?<\/li>/)?.[0];
    expect(firstMarker).toContain("First Player");
    expect(firstMarker).toMatch(/<b[^>]*>1<\/b>/);
  });

  it("uses the same physical track upward for the reverse Order-phase direction", () => {
    const state = structuredClone(startedGame(4, 12_691).state);
    state.firstPlayerId = "P3";
    const workOrder: PlayerId[] = ["P3", "P4", "P1", "P2"];
    state.phase = {
      type: "orders",
      turnOrder: [...workOrder].reverse(),
      currentIndex: 0,
      activePlayerId: "P2",
      completedInCircuit: 0,
    };

    const track = turnOrderTrack(renderTable(projectPublicGameState(state)));
    const markers = markerTags(track);

    // The board order stays First-Player-first from top to bottom. Reading it upward
    // gives P2, P1, P4, P3: the counter-clockwise Order-phase circuit in the rules.
    expect(markers.map((tag) => tag.match(/data-player-id="([^"]+)"/)?.[1])).toEqual(workOrder);
    expect(markers[3]).toContain('aria-current="step"');
    expect(track).toContain("↑");
    expect(track).toContain("↓");
  });

  it("uses names and player colours without rendering seat codes or ceramic instance IDs", () => {
    const state = structuredClone(startedGame(3, 12_692).state);
    const p2Worker = workerId(state, "P2", "apprentice");
    const p3Worker = workerId(state, "P3", "shifu");
    state.players["P2"]!.workers[p2Worker]!.status = "placed";
    state.players["P2"]!.workers[p2Worker]!.locationId = "materials_yard";
    state.players["P3"]!.workers[p3Worker]!.status = "placed";
    state.players["P3"]!.workers[p3Worker]!.locationId = "materials_yard";
    state.actionBoard.placements.materials_yard.push(p2Worker, p3Worker);
    const loaded = addLoaded(state, "P2", "plate", "celadon", "carved", "high_1");
    const finished = addFinished(state, "P1", "vase", "fine", "white", "plain");

    const markup = renderTable(projectPublicGameState(state));
    const workers = markup.match(
      /<span class="kiln-tabletop-worker[^"]*"[^>]*>[\s\S]*?<\/span>/g,
    ) ?? [];

    expect(workers.length).toBeGreaterThanOrEqual(2);
    for (const worker of workers) {
      expect(worker).not.toMatch(/<b[^>]*>P[1-4]<\/b>/);
    }
    expect(markup).not.toMatch(
      /class="kiln-tabletop-ceramic-tooltip-owner"[^>]*>[\s\S]*?<i[^>]*>P[1-4]<\/i>/,
    );
    expect(markup).not.toMatch(/>P[1-4]<\/(?:b|i|small|span)>/);
    expect(markup).not.toContain(`>${loaded.id} ·`);
    expect(markup).not.toContain(`>${finished.id} ·`);
    expect(markup).toContain("Player 2&#x27;s Apprentice");
    expect(markup).toContain("BELONGS TO");
    expect(markup).toContain("Player 2");
  });
});
