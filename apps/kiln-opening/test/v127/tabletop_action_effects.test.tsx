import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LOCATION_DEFINITIONS } from "../../src/game/index.ts";
import { projectPublicGameState } from "../../src/multiplayer/index.ts";
import { ActionSpace, TABLETOP_BOARD_LOCATIONS } from "../../src/ui/TabletopGameExperience.tsx";
import { startedGame, workerId } from "./helpers.ts";

describe.each(["en", "zh-CN"] as const)("both worker effects on the board (%s)", (locale) => {
  it.each([null, "apprentice", "shifu"] as const)("shows both meeples and effects with %s selected", (kind) => {
    const { state } = startedGame(2, 27_920);
    const game = projectPublicGameState(state);
    const selectedWorkerId = kind === null ? null : workerId(state, "P1", kind);
    for (const { id } of TABLETOP_BOARD_LOCATIONS) {
      const markup = renderToStaticMarkup(createElement(ActionSpace, {
        game, ownPlayer: game.players["P1"]!, id, locale, selectedWorkerId, selected: false, onChoose: () => {},
      }));
      expect(markup, id).toContain('data-effect-worker="apprentice"');
      expect(markup, id).toContain('data-effect-worker="shifu"');
      const definition = LOCATION_DEFINITIONS[id];
      // Compact board labels must retain the full, data-backed rules on hover.
      for (const workerKind of ["apprentice", "shifu"] as const) {
        const reminder = locale === "zh-CN" ? definition[`${workerKind}Zh`] : definition[workerKind];
        const title = renderToStaticMarkup(createElement("span", { title: reminder })).match(/title="[^"]*"/)![0];
        expect(markup, `${id}.${workerKind}`).toContain(`data-effect-worker="${workerKind}" ${title}`);
      }
      expect(markup, id).toContain('role="img" aria-label="' + (locale === "en" ? "Apprentice" : "学徒") + '"');
      expect(markup, id).toContain('role="img" aria-label="' + (locale === "en" ? "Shifu" : "师傅") + '"');
      expect(markup.match(/class="kiln-board-effect-copy"/g), id).toHaveLength(2);
      expect(markup, id).not.toContain(locale === "en" ? "Choose a worker" : "选择工人");
      expect(markup.match(/is-current-worker/g) ?? [], id).toHaveLength(kind === null ? 0 : 1);
      if (id === "court_patronage") {
        expect(markup).not.toContain("only 0");
        expect(markup).not.toContain("仅限0");
        expect(markup).toContain("kiln-tabletop-cash-coin");
      }
      if (id === "kiln_yard") {
        expect(markup).toContain(locale === "en" ? "+1 or −1 Heat marker" : "+1或−1");
        expect(markup).not.toContain("neighbouring");
        expect(markup).not.toContain("相邻火候区");
      }
    }
  });
});
