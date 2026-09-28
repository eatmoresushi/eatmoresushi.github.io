import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MAIN_ORDERS, STARTING_ORDERS, STARTING_TECHNIQUES, TECHNIQUE_DEFINITIONS } from "../../src/game";
import type { GameState, StartingTechniqueId } from "../../src/game";
import { projectPublicGameState } from "../../src/multiplayer";
import { ActionPanel } from "../../src/ui/ActionPanel";
import { GameTable, OrderCard as ReferenceOrderCard } from "../../src/ui/GameTable";
import { OrderFace, TechniqueFace } from "../../src/ui/PieceFaces";
import { OrderIllustration } from "../../src/ui/OrderIllustration";
import { OrderCard, PlayerInspection, StartingTechniqueInspection, StaticOrderCard, TabletopGameExperience, TechniqueInspection } from "../../src/ui/TabletopGameExperience";
import { techniqueFullCopy, techniqueShortPlainText } from "../../src/ui/TechniqueDescription";
import { LanguageProvider, type Locale } from "../../src/ui/i18n";
import { startedGame, workerId } from "../v127/helpers";

const orders = [...STARTING_ORDERS, ...MAIN_ORDERS];
const techniques = Object.values(TECHNIQUE_DEFINITIONS);

function localized(locale: Locale, children: ReturnType<typeof createElement>): string {
  return renderToStaticMarkup(createElement(LanguageProvider, { initialLocale: locale, children }));
}

function text(markup: string): string {
  return markup.replace(/<br\s*\/?>/gu, "\n").replace(/<[^>]*>/gu, "")
    .replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<").replaceAll("&gt;", ">");
}

function card(markup: string, attribute: string, id: string): string {
  const match = markup.match(new RegExp(`<(?:button|article|li)\\b[^>]*${attribute}="${id}"[^>]*>[\\s\\S]*?</(?:button|article|li)>`, "u"));
  expect(match, `${id} is rendered as a card`).not.toBeNull();
  return match![0];
}

function expectStaticFace(markup: string): void {
  expect(markup).not.toMatch(/\stitle=|data-hover-preview=|data-preview-id=|role="tooltip"/u);
}

function normalizeCeramicSvgIds(markup: string): string {
  // useId reflects the React wrapper tree; preserve each SVG's distinct IDs
  // and references while comparing its artwork, glaze and other face content.
  const ids = new Map<string, string>();
  return markup.replace(/<svg\b[^>]*class="kiln-ceramic-art"[\s\S]*?<\/svg>/gu, (svg) =>
    svg.replace(/ceramic-glaze-[^"\s()]+/gu, (id: string) => {
      if (!ids.has(id)) ids.set(id, `ceramic-glaze-illustration-${ids.size}`);
      return ids.get(id)!;
    }),
  );
}

function expectTechInspectionDescription(markup: string, tile: string, id: string, locale: Locale): void {
  expect(tile).toContain('aria-haspopup="dialog"');
  const descriptionId = tile.match(/aria-describedby="([^"]+)"/u)?.[1];
  expect(descriptionId).toBeDefined();
  const description = markup.match(new RegExp(`<span class="sr-only" id="${descriptionId}">([\\s\\S]*?)</span>`, "u"))?.[1];
  expect(description).toBeDefined();
  expect(text(description!)).toBe(techniqueShortPlainText(id, locale));
}

function expectChoiceDescriptions(markup: string, expectedCount: number): void {
  const choices = [...markup.matchAll(/<button\b[^>]*class="[^"]*kiln-piece-choice[^"]*"[^>]*>[\s\S]*?<\/button>/gu)].map(([choice]) => choice);
  expect(choices).toHaveLength(expectedCount);
  const descriptionIds = choices.map((choice) => {
    const id = choice.match(/aria-describedby="([^"]+)"/u)?.[1];
    expect(id, "the choice links its visible rules as its accessible description").toBeDefined();
    expect(choice).toContain(`id="${id}"><article`);
    expect(choice).toContain('class="kiln-piece-copy"');
    return id;
  });
  expect(new Set(descriptionIds).size).toBe(expectedCount);
}

function showAllTechniques(state: GameState): void {
  for (const discipline of ["forming", "glazing", "firing"] as const) {
    state.techniqueDisplay[discipline] = techniques.filter((technique) => technique.discipline === discipline).map(({ id }) => id);
  }
}

describe("individual piece illustrations", () => {
  it("renders all 19 Techs without illustrations in preview and full-detail faces", () => {
    for (const { id } of [...STARTING_TECHNIQUES, ...techniques]) {
      for (const locale of ["en", "zh-CN"] as const) {
        for (const layer of ["preview", "full"] as const) {
          const face = renderToStaticMarkup(createElement(TechniqueFace, { id, locale, layer }));
          expect(face, `${id} ${locale} ${layer}`).not.toMatch(/kiln-piece-art|<img|background-image/u);
        }
      }
    }
  });

  it("reuses the live ceramic artwork on every Order without replacing rule text", () => {
    const renderedShapes = new Set<string>();
    for (const order of orders) {
      const markup = renderToStaticMarkup(createElement(OrderIllustration, { id: order.id }));
      expect(markup).toMatch(/class="kiln-piece-order-illustration"[^>]*aria-hidden="true"/u);
      const images = [...markup.matchAll(/<svg\b[^>]*data-ceramic-art[^>]*>/gu)].map(([image]) => image);
      expect(images, order.id).toHaveLength(order.ceramics.length);
      images.forEach((image, index) => {
        expect(image).toContain('aria-hidden="true"');
        expect(image).toContain('data-glaze="');
        expect(image).toContain('data-decoration="');
        expect(image).not.toMatch(/\stitle=|data-quality=/u);
        const shape = image.match(/data-ceramic-art="([^-]+)-/u)![1]!;
        const requirement = order.ceramics[index]!;
        if (requirement.shape !== undefined) expect(shape).toBe(requirement.shape);
        if (requirement.shapes !== undefined) expect(requirement.shapes).toContain(shape);
        renderedShapes.add(shape);
      });
      expect(markup).toContain("/ceramics/ceramic-");
      expect(markup).not.toContain("/pieces/vessel-");
    }
    expect([...renderedShapes].sort()).toEqual(["bowl", "censer", "plate", "vase", "washer"]);
  });
});

describe.each(["en", "zh-CN"] as const)("shared Order and Tech faces (%s)", (locale) => {
  it("shows short reminders on all inspection tiles and full rules immediately below them", () => {
    for (const technique of [...STARTING_TECHNIQUES, ...techniques]) {
      const isAdvanced = "cost" in technique;
      const inspection = isAdvanced
        ? createElement(TechniqueInspection, { id: technique.id, locale })
        : createElement(StartingTechniqueInspection, { id: technique.id as StartingTechniqueId, locale });
      const markup = renderToStaticMarkup(inspection);
      const tile = card(markup, isAdvanced ? "data-technique-id" : "data-starting-technique-id", technique.id);
      expect(tile).toContain('data-description-layer="preview"');
      expect(text(tile)).toContain(techniqueShortPlainText(technique.id, locale));
      expect(text(tile)).not.toContain(techniqueFullCopy(technique.id, locale));
      const rules = markup.match(new RegExp(`<section[^>]*data-full-technique-id="${technique.id}"[^>]*>[\\s\\S]*?</section>`, "u"))?.[0];
      expect(rules).toBeDefined();
      expect(rules).toContain(`<h3>${locale === "en" ? "Full rules" : "完整规则"}</h3>`);
      expect(text(rules!)).toContain(techniqueFullCopy(technique.id, locale));
      expect(markup).toContain(`${tile}${rules}`);
      expect(markup).toContain(locale === "en" ? "Tech abilities are optional" : "技艺能力均可选择使用");
    }
  });

  it("keeps each player's full Tech rules in keyboard-accessible expandable sections outside the square tiles", () => {
    const game = projectPublicGameState(startedGame(2, 14053).state);
    const player = game.players["P1"]!;
    for (const technique of [...STARTING_TECHNIQUES, ...techniques]) {
      const isAdvanced = "cost" in technique;
      player.startingTechniqueId = isAdvanced ? null : technique.id as StartingTechniqueId;
      player.techniques = isAdvanced ? [{ id: technique.id, exhausted: true }] : [];
      const markup = renderToStaticMarkup(createElement(PlayerInspection, { player, game, locale }));
      const tile = card(markup, isAdvanced ? "data-technique-id" : "data-starting-technique-id", technique.id);
      expect(tile).toContain('data-description-layer="preview"');
      expect(text(tile)).toContain(techniqueShortPlainText(technique.id, locale));
      expect(text(tile)).not.toContain(techniqueFullCopy(technique.id, locale));
      if (isAdvanced) expect(text(tile)).toContain(locale === "en" ? "Used" : "已用");
      const rules = markup.match(new RegExp(`<details[^>]*data-full-technique-id="${technique.id}"[^>]*>[\\s\\S]*?</details>`, "u"))?.[0];
      expect(rules).toBeDefined();
      expect(rules).toContain(`<summary tabindex="0">${locale === "en" ? "Full rules" : "完整规则"} · ${technique.id}</summary>`);
      expect(text(rules!)).toContain(techniqueFullCopy(technique.id, locale));
      expect(markup).toContain(`${tile}${rules}`);
    }
  });

  it("retains the same illustrated requirements and rewards on all 56 Orders across board, owned and reference wrappers", () => {
    expect(orders).toHaveLength(56);
    for (const order of orders) {
      // React hoists image preload hints outside each wrapper; compare the visible face only.
      const face = normalizeCeramicSvgIds(renderToStaticMarkup(createElement(OrderFace, { id: order.id, locale })).replace(/<link\b[^>]*>/gu, ""));
      expectStaticFace(face);
      expect(text(face)).toContain(locale === "en" ? order.requirements : order.requirementsZh);
      expect(face).toContain(`<b>${order.vp}</b>`);
      expect(face).toContain(`<b>${order.coins}</b>`);
      if (order.crowns > 0) {
        const crownLabel = locale === "en" ? `${order.crowns} Crown${order.crowns === 1 ? "" : "s"}` : `${order.crowns}皇冠`;
        expect(face).toContain(`role="img" aria-label="${crownLabel}"`);
        expect((face.match(/class="kiln-piece-crown-icon"/gu) ?? [])).toHaveLength(order.crowns);
      } else {
        expect(face).not.toContain("kiln-piece-crown-icon");
      }
      for (const owned of [false, true]) {
        const markup = renderToStaticMarkup(createElement(OrderCard, { id: order.id, locale, owned, onInspect: () => {} }));
        expect(normalizeCeramicSvgIds(markup)).toContain(face);
        expect(markup).toContain('aria-haspopup="dialog"');
        expect(markup).toContain(`aria-label="${locale === "en" ? "Inspect Order" : "查看委托"} ${order.id}"`);
        expectStaticFace(markup);
      }
      expect(normalizeCeramicSvgIds(renderToStaticMarkup(createElement(StaticOrderCard, { id: order.id, locale })))).toContain(face);
      expect(normalizeCeramicSvgIds(localized(locale, createElement(ReferenceOrderCard, { orderId: order.id })))).toContain(face);
    }
  });

  it("keeps all 4 Starting and 15 Advanced Techs readable with full click rules and costs/VP only on Advanced Techs", () => {
    expect(STARTING_TECHNIQUES).toHaveLength(4);
    expect(techniques).toHaveLength(15);
    for (const technique of [...STARTING_TECHNIQUES, ...techniques]) {
      const id = technique.id;
      const face = renderToStaticMarkup(createElement(TechniqueFace, { id, locale }));
      const fullFace = renderToStaticMarkup(createElement(TechniqueFace, { id, locale, layer: "full" }));
      expectStaticFace(face);
      expectStaticFace(fullFace);
      expect(text(face)).toContain(locale === "en" ? technique.name : technique.nameZh);
      expect(text(face)).toContain(techniqueShortPlainText(id, locale));
      expect(text(fullFace)).toContain(techniqueFullCopy(id, locale));
      if ("cost" in technique) {
        expect(face).toContain(`aria-label="${technique.cost}${locale === "en" ? " Coins" : "铜钱"}"`);
        expect(face).toContain('class="kiln-piece-endgame-vp"');
        expect(face).toContain('>1VP</b>');
      } else {
        expect(face).not.toContain("kiln-piece-cost");
        expect(face).not.toContain("kiln-piece-endgame-vp");
      }
    }
  });

  it("uses compact shared faces on the table and normal shared faces for reference/purchase while preserving the Shifu's actual price", () => {
    const { state } = startedGame(2, 14051);
    showAllTechniques(state);
    const publicGame = projectPublicGameState(state);
    publicGame.players["P1"]!.techniques = techniques.map(({ id }) => ({ id, exhausted: false }));
    const tabletop = localized(locale, createElement(TabletopGameExperience, {
      game: publicGame, ownPlayerId: "P1", ownPendingContribution: null, busy: false, send: async () => true,
      events: [], describeEvent: (record) => record.event.type,
    }));
    const reference = localized(locale, createElement(GameTable, { game: publicGame, ownPlayerId: "P1" }));
    state.phase = { type: "work_guild", actorId: "P1", workerId: workerId(state, "P1", "shifu"), step: "buy" };
    state.players["P1"]!.resources.coins = 99;
    const buying = localized(locale, createElement(ActionPanel, {
      game: projectPublicGameState(state), ownPlayerId: "P1", ownPendingContribution: null, busy: false, send: async () => true,
    }));
    const ownTechs = tabletop.match(/<section class="kiln-tabletop-own-techs">[\s\S]*?<\/section>/u)?.[0];
    expect(ownTechs).toBeDefined();
    for (const technique of techniques) {
      const face = renderToStaticMarkup(createElement(TechniqueFace, { id: technique.id, locale }));
      const overviewFace = renderToStaticMarkup(createElement(TechniqueFace, { id: technique.id, locale, overview: true }));
      const tableCard = card(tabletop, "data-technique-id", technique.id);
      expect(tableCard).toContain(overviewFace);
      expectTechInspectionDescription(tabletop, tableCard, technique.id, locale);
      expectStaticFace(tableCard);
      const ownCard = card(ownTechs!, "data-technique-id", technique.id);
      expect(ownCard).toContain(overviewFace);
      expectTechInspectionDescription(tabletop, ownCard, technique.id, locale);
      expectStaticFace(ownCard);
      for (const surface of [reference, buying]) {
        const renderedCard = card(surface, "data-technique-id", technique.id);
        expect(renderedCard).toContain(face);
        expectStaticFace(renderedCard);
      }
      const actualCost = Math.max(0, technique.cost - 1);
      const name = locale === "en" ? technique.name : technique.nameZh;
      expect(buying).toContain(`<span class="command-label">${technique.id} · ${name} · ${actualCost} ${locale === "en" ? "Coins" : "铜钱"}</span>`);
    }
    expect(buying).not.toMatch(/\stitle=|data-hover-preview=|role="tooltip"/u);
    expectChoiceDescriptions(buying, techniques.length);
  });

  it("keeps Starting Tech setup text and uses compact workshop faces with complete accessible reminders", () => {
    const { state } = startedGame(4, 14052);
    const game = projectPublicGameState(state);
    state.phase = { type: "setup_starting_tech", decisionOrder: ["P1", "P2", "P3", "P4"], currentIndex: 0 };
    const setup = localized(locale, createElement(ActionPanel, {
      game: projectPublicGameState(state), ownPlayerId: "P1", ownPendingContribution: null, busy: false, send: async () => true,
    }));
    for (const technique of STARTING_TECHNIQUES) {
      const playerId = game.playerOrder.find((id) => game.players[id]!.startingTechniqueId === technique.id)!;
      const tabletop = localized(locale, createElement(TabletopGameExperience, {
        game, ownPlayerId: playerId, ownPendingContribution: null, busy: false, send: async () => true,
        events: [], describeEvent: (record) => record.event.type,
      }));
      const face = renderToStaticMarkup(createElement(TechniqueFace, { id: technique.id, locale }));
      const setupCard = card(setup, "data-starting-technique-id", technique.id);
      expect(setupCard).toContain(face);
      expectStaticFace(setupCard);
      const ownCard = card(tabletop, "data-starting-technique-id", technique.id);
      const overviewFace = renderToStaticMarkup(createElement(TechniqueFace, { id: technique.id, locale, overview: true }));
      expect(ownCard).toContain(overviewFace);
      expectTechInspectionDescription(tabletop, ownCard, technique.id, locale);
      expectStaticFace(ownCard);
    }
    expect(setup).not.toMatch(/\stitle=|data-hover-preview=|role="tooltip"/u);
    expectChoiceDescriptions(setup, STARTING_TECHNIQUES.length);
  });
});
