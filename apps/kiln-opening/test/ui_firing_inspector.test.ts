import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { projectPublicGameState } from "../src/multiplayer";
import { ceramicLabel } from "../src/ui/ActionPanel";
import { GameTable, ceramicDescription, firingContributionText } from "../src/ui/GameTable";
import { eventDescription } from "../src/ui/PlaytestExperience";
import { CeramicPiece } from "../src/ui/tabletop/TabletopPieces";
import { addFinished, startedGame } from "./helpers";

describe("player-facing ceramic and firing labels", () => {
  it("keeps ceramic IDs out of labels, logs, tooltips, and the firing inspector", () => {
    const fixture = startedGame(2, 18100);
    const actorId = fixture.state.firstPlayerId;
    fixture.state.players[actorId]!.displayName = "Player A";
    const ceramic = addFinished(fixture.state, actorId, "bowl", "fine", "white", "plain");
    fixture.state.lastFiringResult = {
      round: 1,
      contributors: [actorId],
      contributions: { [actorId]: 2 },
      baseHeat: 3,
      fireModifier: -1,
      globalHeat: 2,
    };
    const game = projectPublicGameState(fixture.state);

    expect(ceramicDescription(ceramic)).not.toContain(ceramic.id);
    expect(ceramicLabel(ceramic)).not.toContain(ceramic.id);
    expect(eventDescription({
      type: "QUALITY_ASSIGNED",
      ceramicId: ceramic.id,
      quality: "fine",
    }, game)).not.toContain(ceramic.id);

    const pieceMarkup = renderToStaticMarkup(createElement(CeramicPiece, { ceramic }));
    expect(pieceMarkup).not.toContain(ceramic.id);

    const tableMarkup = renderToStaticMarkup(createElement(GameTable, { game, ownPlayerId: actorId }));
    expect(tableMarkup).toContain("Wood Contributions");
    expect(tableMarkup).toContain("Player A contributed 2 Wood");
    expect(tableMarkup).toContain("Total Wood");
    expect(tableMarkup).not.toContain(ceramic.id);
  });

  it("uses a clear revealed contribution sentence", () => {
    const fixture = startedGame(2, 18101);
    const actorId = fixture.state.firstPlayerId;
    fixture.state.players[actorId]!.displayName = "Player A";
    const game = projectPublicGameState(fixture.state);

    expect(firingContributionText(game, { [actorId]: 2 })).toBe("Player A contributed 2 Wood");
  });
});
