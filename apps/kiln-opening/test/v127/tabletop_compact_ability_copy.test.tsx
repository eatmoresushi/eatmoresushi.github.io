import { STARTING_TECHNIQUE_DEFINITIONS, TECHNIQUE_DEFINITIONS, KILN_DEFINITIONS } from "../../src/game/index.ts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { projectPublicGameState } from "../../src/multiplayer/index.ts";
import {
  ADVANCED_TECHNIQUE_IDS,
  KILN_COPY_IDS,
  KILN_SHORT_COPY,
  KilnDescription,
  TECHNIQUE_SHORT_COPY,
  TechniqueDescription,
  kilnFullCopy,
  kilnShortPlainText,
  techniqueFullCopy,
  techniqueShortPlainText,
} from "../../src/ui/TechniqueDescription.tsx";
import { TabletopGameExperience } from "../../src/ui/TabletopGameExperience.tsx";
import { techniqueOverviewCopy } from "../../src/ui/TechniqueOverview.ts";
import { LanguageProvider } from "../../src/ui/i18n.tsx";
import { startedGame } from "./helpers.ts";

const STARTING_TECHNIQUE_IDS = ["ST01", "ST02", "ST03", "ST04"] as const;
const ALL_TECHNIQUE_IDS = [...STARTING_TECHNIQUE_IDS, ...ADVANCED_TECHNIQUE_IDS] as const;

function renderedText(markup: string): string {
  return markup
    .replace(/<br\s*\/?\s*>/gu, "\n")
    .replace(/<[^>]*>/gu, "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function tabletopMarkup(ownPlayerId: "P1" | "P2" | "P3" | "P4", locale: "en" | "zh-CN"): string {
  const state = structuredClone(startedGame(4, 12_673).state);
  state.techniqueDisplay.forming = [...ADVANCED_TECHNIQUE_IDS.slice(0, 5)];
  state.techniqueDisplay.glazing = [...ADVANCED_TECHNIQUE_IDS.slice(5, 10)];
  state.techniqueDisplay.firing = [...ADVANCED_TECHNIQUE_IDS.slice(10, 15)];
  const game = projectPublicGameState(state);
  return renderToStaticMarkup(createElement(LanguageProvider, {
    initialLocale: locale,
    children: createElement(TabletopGameExperience, {
      game,
      ownPlayerId,
      ownPendingContribution: null,
      events: [],
      describeEvent: (record) => record.event.type,
      busy: false,
      send: async () => true,
    }),
  }));
}

describe("tabletop compact Technique copy", () => {
  it("covers every one of the 4 Starting and 15 Advanced Techs", () => {
    expect(Object.keys(TECHNIQUE_SHORT_COPY)).toEqual(ALL_TECHNIQUE_IDS);
    expect(ALL_TECHNIQUE_IDS).toHaveLength(19);
    expect(STARTING_TECHNIQUE_IDS.every((id) => STARTING_TECHNIQUE_DEFINITIONS[id] !== undefined)).toBe(true);
    expect(ADVANCED_TECHNIQUE_IDS.every((id) => TECHNIQUE_DEFINITIONS[id] !== undefined)).toBe(true);
  });

  it("renders all reminders separately from click-open full rules", () => {
    let previewLength = 0;
    let fullLength = 0;
    for (const id of ALL_TECHNIQUE_IDS) {
      for (const locale of ["en", "zh-CN"] as const) {
        const preview = techniqueShortPlainText(id, locale);
        const full = techniqueFullCopy(id, locale);
        expect(preview.length, `${id} ${locale}`).toBeGreaterThan(0);
        previewLength += preview.length;
        fullLength += full.length;

        const previewMarkup = renderToStaticMarkup(createElement(TechniqueDescription, { id, locale, layer: "preview" }));
        const fullMarkup = renderToStaticMarkup(createElement(TechniqueDescription, { id, locale, layer: "full" }));
        if (id.startsWith("ST")) expect(previewMarkup, `${id} ${locale} preview`).toContain("<strong>");
        else expect(previewMarkup, `${id} ${locale} preview`).not.toContain("<strong>");
        expect(previewMarkup, `${id} ${locale} preview`).not.toContain("**");
        expect(fullMarkup.length).toBeGreaterThan(0);
      }
    }
    expect(previewLength).toBeGreaterThan(0);
  });

  it("retains full structured V1.4 rules separately from owner-supplied Tech reminders", () => {
    for (const id of ALL_TECHNIQUE_IDS) {
      const definition = id.startsWith("ST") ? STARTING_TECHNIQUE_DEFINITIONS[id as "ST01"] : TECHNIQUE_DEFINITIONS[id]!;
      expect(techniqueFullCopy(id, "en")).toBe(definition.ability);
      expect(techniqueFullCopy(id, "zh-CN")).toBe(definition.abilityZh);

    }
    expect(TECHNIQUE_SHORT_COPY.ST02.en).toContain("Painted");
    expect(TECHNIQUE_SHORT_COPY.T06.en).toContain("end of the Work Phase");
    expect(TECHNIQUE_SHORT_COPY.T12.en).not.toContain("extra Wood");
  });

  it("shows the same component copy on public and personal cards while retaining click inspection", () => {
    for (const locale of ["en", "zh-CN"] as const) {
      const markups = (["P1", "P2", "P3", "P4"] as const).map((playerId) => tabletopMarkup(playerId, locale));
      const combinedText = markups.map(renderedText).join("\n");
      for (const markup of markups) {
        expect(markup).not.toMatch(/data-hover-preview="(?:advanced-technique|starting-technique)"/);
        expect(markup).toMatch(/<button[^>]*aria-haspopup="dialog"[^>]*data-technique-id="T\d+"/);
        expect(markup).toMatch(/<button[^>]*aria-haspopup="dialog"[^>]*data-starting-technique-id="ST\d+"/);
      }
      for (const id of ALL_TECHNIQUE_IDS) {
        expect(combinedText, `${id} ${locale} preview`).toContain(techniqueShortPlainText(id, locale));
        if (!techniqueShortPlainText(id, locale).includes(techniqueFullCopy(id, locale))) expect(combinedText, `${id} ${locale} full`).not.toContain(techniqueFullCopy(id, locale));
      }
      for (const id of ALL_TECHNIQUE_IDS) {
        const attribute = id.startsWith("ST") ? "data-starting-technique-id" : "data-technique-id";
        const tile = markups.map((markup) => markup.match(new RegExp(`<button[^>]*${attribute}="${id}"[^>]*>[\\s\\S]*?</button>`, "u"))?.[0]).find((markup) => markup !== undefined);
        expect(tile, `${id} ${locale} visible overview`).toBeDefined();
        expect(tile).toContain('data-overview="true"');
        expect(renderedText(tile!)).toContain(techniqueOverviewCopy(id, locale));
        expect(renderedText(tile!)).toContain(techniqueShortPlainText(id, locale));
      }
    }
  });
});

describe("tabletop compact Kiln copy", () => {
  it("covers all five Kiln traditions with compact hover and full click layers", () => {
    expect(Object.keys(KILN_SHORT_COPY)).toEqual(KILN_COPY_IDS);
    expect(KILN_COPY_IDS).toHaveLength(5);

    for (const id of KILN_COPY_IDS) {
      expect(KILN_DEFINITIONS[id]).toBeDefined();
      for (const locale of ["en", "zh-CN"] as const) {
        const preview = kilnShortPlainText(id, locale);
        const full = kilnFullCopy(id, locale);
        expect(preview.length, `${id} ${locale}`).toBeGreaterThan(0);
        expect(full.length).toBeGreaterThan(0);

        const previewMarkup = renderToStaticMarkup(createElement(KilnDescription, { id, locale, layer: "preview" }));
        const fullMarkup = renderToStaticMarkup(createElement(KilnDescription, { id, locale, layer: "full" }));
        expect(previewMarkup, `${id} ${locale} preview`).toContain("<strong>");
        expect(previewMarkup, `${id} ${locale} preview`).not.toContain("**");
        expect(fullMarkup.length).toBeGreaterThan(0);
      }
    }
  });

  it("retains full structured V1.4 Kiln rules separately from reminders in both languages", () => {
    for (const id of KILN_COPY_IDS) {
      expect(kilnFullCopy(id, "en")).toBe(KILN_DEFINITIONS[id].ability);
      expect(kilnFullCopy(id, "zh-CN")).toBe(KILN_DEFINITIONS[id].abilityZh);

    }
  });

  it("explains Ge’s actual Fine upgrade and independent Crackle property", () => {
    for (const layer of ["preview", "full"] as const) {
      const english = renderedText(renderToStaticMarkup(createElement(KilnDescription, { id: "GE", locale: "en", layer })));
      expect(english).toContain("Crackle");
      expect(english).toContain("Fine");
      expect(english).toContain("from this firing");
      if (layer === "full") {
        expect(english).toContain("actual Glaze and Decoration do not change");
        expect(english).toContain("Its actual Quality is Fine");
      } else {
        expect(english).toBe("Once per round, after Quality is assigned: 1 of your Standard ceramics from this firing → Fine + Crackle.\nOrders: each Crackle ceramic may count as any 1 Decoration.");
      }
      const chinese = renderedText(renderToStaticMarkup(createElement(KilnDescription, { id: "GE", locale: "zh-CN", layer })));
      expect(chinese).toContain("开片");
      expect(chinese).toContain("上品");
    }
  });

  it("wires each player's Kiln reminder to hover/focus while click retains full details", () => {
    for (const locale of ["en", "zh-CN"] as const) {
      const state = structuredClone(startedGame(4, 12_674).state);
      const renderedKilns: string[] = [];
      for (const id of KILN_COPY_IDS) {
        state.players["P1"]!.kilnId = id;
        const game = projectPublicGameState(state);
        const markup = renderToStaticMarkup(createElement(LanguageProvider, {
          initialLocale: locale,
          children: createElement(TabletopGameExperience, {
            game,
            ownPlayerId: "P1",
            ownPendingContribution: null,
            events: [],
            describeEvent: (record) => record.event.type,
            busy: false,
            send: async () => true,
          }),
        }));
        expect(markup).toContain('data-hover-preview="kiln-tradition"');
        const tableText = renderedText(markup);
        expect(tableText).toContain(kilnShortPlainText(id, locale));
        const compactText = kilnShortPlainText(id, locale).replace(/\s+/g, "");
        const fullText = kilnFullCopy(id, locale).replace(/\s+/g, "");
        if (!compactText.includes(fullText)) expect(tableText).not.toContain(kilnFullCopy(id, locale));
        renderedKilns.push(id);
      }
      expect(renderedKilns).toEqual(KILN_COPY_IDS);
    }
  });
});
