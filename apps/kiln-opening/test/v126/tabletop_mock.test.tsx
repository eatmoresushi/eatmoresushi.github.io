import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FIRE_CARDS, MAIN_ORDERS, TECHNIQUE_DEFINITIONS } from "../../src/game/index.ts";
import { LanguageProvider } from "../../src/ui/i18n.tsx";
import type { Locale } from "../../src/ui/i18n.tsx";
import { TabletopMockPage } from "../../src/ui/mock/TabletopMockPage.tsx";
import { MOCK_PLAYER_COUNT, TABLETOP_MOCK_FIXTURE } from "../../src/ui/mock/tabletopMockFixture.ts";

function renderMock(locale: Locale): string {
  return renderToStaticMarkup(
    createElement(LanguageProvider, {
      initialLocale: locale,
      children: createElement(TabletopMockPage),
    }),
  );
}

describe("V1.2.6 tabletop UI concept", () => {
  it("renders the complete English review surface from current rule data", () => {
    const markup = renderMock("en");

    expect(markup).toContain("UI concept · sample state");
    expect(markup).toContain("Face-up Main Orders");
    expect(markup).toContain("Shared Kiln");
    expect(markup).toContain("Imperial Recognition");
    expect(markup).toContain("Face-up Techs");

    for (const location of [
      "Materials Yard",
      "Potter’s Wheel",
      "Glaze &amp; Decoration",
      "Commission Market",
      "Guild &amp; Academy",
      "Labour",
      "Kiln Yard",
    ]) {
      expect(markup).toContain(location);
    }

    for (const id of ["O09", "O21", "O27", "O39", "O47", "T01", "T04", "T07", "T10", "T13", "T15"]) {
      expect(markup).toContain(id);
    }

    for (const [playerId, accent] of [["P1", "cinnabar"], ["P2", "river"], ["P3", "ochre"], ["P4", "plum"]]) {
      expect(markup).toContain(`kiln-mock-worker kiln-mock-accent-${accent}`);
      expect(markup).toContain(`data-player-id="${playerId}"`);
    }

    expect(markup).toContain('data-worker-kind="shifu"');
    expect(markup).toContain('class="kiln-mock-worker-hat"');
    expect(markup).toContain('>S</text>');
    expect(markup).toContain('data-worker-kind="apprentice"');
    expect(markup).toContain('>A</text>');

    expect(markup).toContain('data-min-players="3"');
    expect(markup).toContain('>3P</i>');
    expect(markup).toContain('data-min-players="4"');
    expect(markup).toContain('>4P</i>');

    expect(markup.match(/role="tooltip"/g)).toHaveLength(TABLETOP_MOCK_FIXTURE.kilnCeramics.filter(Boolean).length + TABLETOP_MOCK_FIXTURE.workshopCeramics.length);
    expect(markup).toContain(">Preferred Heat</small><strong>2</strong>");
    expect(markup).toContain("BELONGS TO");
    expect(markup).toContain("Celadon");
    expect(markup).toContain("Plain");
    expect(markup).not.toMatch(/<i>素<\/i>|<i>刻<\/i>|<i>印<\/i>|<i>裂<\/i>/);
    expect(markup).toContain('data-shape="plate"');
    expect(markup).toContain('data-glaze="moon_white"');
    expect(markup).toContain('data-decoration="carved"');
    expect(markup).toContain('class="kiln-mock-decoration-pattern is-carved"');
    expect(markup).toContain('class="kiln-mock-decoration-pattern is-impressed"');
    expect(markup).toContain('class="kiln-mock-decoration-pattern is-crackle"');
    expect(markup).toContain("Not yet glazed");
    expect(markup).toContain("Not yet decorated");
    expect(markup).toContain('class="kiln-mock-quality-badge is-fine"');
    expect(markup).toContain(">Fine</b>");
    expect(markup).not.toContain(">Fi</b>");
    expect(markup).toMatch(/class="kiln-mock-shifu-marker"[^>]*>S<\/em>/);
  });

  it("renders the same public table in Simplified Chinese", () => {
    const markup = renderMock("zh-CN");

    expect(markup).toContain("界面概念 · 示例状态");
    expect(markup).toContain("公开主委托");
    expect(markup).toContain("共窑板");
    expect(markup).toContain("共窑");
    expect(markup).toContain("御府声望");
    expect(markup).toContain("公开进阶技艺");
    expect(markup).toContain("你的作坊");
    expect(markup).toContain(">适烧火候</small><strong>2</strong>");
    expect(markup).toContain("所属玩家");
    expect(markup).toContain("尚未施釉");
    expect(markup).toContain("尚未装饰");
    expect(markup).toMatch(/class="kiln-mock-shifu-marker"[^>]*>师<\/em>/);
  });

  it("does not surface explicitly obsolete mechanics", () => {
    const markup = renderMock("en");

    for (const obsoleteTerm of [
      "Refined Clay",
      "Refining House",
      "Hire or Train",
      "Imperial Office",
      "Imperial Seal",
      "specialist worker",
    ]) {
      expect(markup).not.toContain(obsoleteTerm);
    }
  });

  it("uses every physical Order and Advanced Tech at most once in its sample state", () => {
    const heldOrders = TABLETOP_MOCK_FIXTURE.players.flatMap((player) => player.orderIds);
    expect(new Set(heldOrders).size).toBe(heldOrders.length);
    expect(TABLETOP_MOCK_FIXTURE.marketOrderIds.every((id) => !heldOrders.includes(id))).toBe(true);
    expect(
      heldOrders.length
      + TABLETOP_MOCK_FIXTURE.marketOrderIds.length
      + TABLETOP_MOCK_FIXTURE.mainOrderDeckRemaining
      + TABLETOP_MOCK_FIXTURE.rotatedMainOrderCount,
    ).toBe(MAIN_ORDERS.length);

    for (const discipline of ["forming", "glazing", "firing"] as const) {
      const held = TABLETOP_MOCK_FIXTURE.players
        .flatMap((player) => player.techniqueIds)
        .filter((id) => TECHNIQUE_DEFINITIONS[id]?.discipline === discipline);
      const faceUp = TABLETOP_MOCK_FIXTURE.faceUpTechniques[discipline];
      const allVisible = [...held, ...faceUp];

      expect(faceUp).toHaveLength(2);
      expect(new Set(allVisible).size).toBe(allVisible.length);
      expect(allVisible.length + TABLETOP_MOCK_FIXTURE.techniqueDeckRemaining[discipline]).toBe(5);
    }
  });

  it("accounts for the sample state's workers, loaded ceramics, and Fire cards", () => {
    expect(MOCK_PLAYER_COUNT).toBe(TABLETOP_MOCK_FIXTURE.players.length);
    const placements = Object.values(TABLETOP_MOCK_FIXTURE.actionOccupancy).flat();

    for (const player of TABLETOP_MOCK_FIXTURE.players) {
      const playerPlacements = placements.filter((placement) => placement.playerId === player.id);
      expect(playerPlacements.length + player.workersRemaining).toBe(4);

      const loadCapacity = (TABLETOP_MOCK_FIXTURE.actionOccupancy.kiln_yard ?? [])
        .filter((placement) => placement.playerId === player.id)
        .reduce((total, placement) => total + (placement.kind === "shifu" ? 2 : 1), 0);
      const loadedCeramics = TABLETOP_MOCK_FIXTURE.kilnCeramics
        .filter((ceramic) => ceramic?.ownerId === player.id).length;
      expect(loadedCeramics).toBeLessThanOrEqual(loadCapacity);
    }

    expect(TABLETOP_MOCK_FIXTURE.fireDeckRemaining + TABLETOP_MOCK_FIXTURE.mainFireCardsDiscarded).toBe(FIRE_CARDS.length);
  });
});
