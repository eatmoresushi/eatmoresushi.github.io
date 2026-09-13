import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  KILN_DEFINITIONS,
  STARTING_TECHNIQUE_DEFINITIONS,
  TECHNIQUE_DEFINITIONS,
} from "../../src/game/index.ts";
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
import { LanguageProvider } from "../../src/ui/i18n.tsx";
import { startedGame } from "./helpers.ts";

const STARTING_TECHNIQUE_IDS = ["ST01", "ST02", "ST03", "ST04"] as const;
const ALL_TECHNIQUE_IDS = [...STARTING_TECHNIQUE_IDS, ...ADVANCED_TECHNIQUE_IDS] as const;

function renderedText(markup: string): string {
  return markup
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

  it("keeps every hover/focus reminder shorter and distinct from click-open full rules", () => {
    let previewLength = 0;
    let fullLength = 0;
    for (const id of ALL_TECHNIQUE_IDS) {
      for (const locale of ["en", "zh-CN"] as const) {
        const preview = techniqueShortPlainText(id, locale);
        const full = techniqueFullCopy(id, locale);
        expect(preview, `${id} ${locale}`).not.toBe(full);
        previewLength += preview.length;
        fullLength += full.length;

        const previewMarkup = renderToStaticMarkup(createElement(TechniqueDescription, { id, locale, layer: "preview" }));
        const fullMarkup = renderToStaticMarkup(createElement(TechniqueDescription, { id, locale, layer: "full" }));
        expect(previewMarkup, `${id} ${locale} preview`).not.toContain("<strong>");
        expect(previewMarkup, `${id} ${locale} preview`).not.toContain("**");
        expect(fullMarkup, `${id} ${locale} full`).not.toBe(previewMarkup);
      }
    }
    expect(previewLength).toBeLessThan(fullLength);
  });

  it("preserves the supplied compact English and Simplified Chinese wording", () => {
    expect(TECHNIQUE_SHORT_COPY).toEqual({
      ST01: { en: "After each **Materials Yard** action: pay **1 more Clay than its cost** → form 1 vessel.", "zh-CN": "每次**泥柴场**行动后：比该器形费用多付 **1 泥** → 形成 1 件器物。" },
      ST02: { en: "After each **Potter’s Wheel** action: give 1 vessel formed by that action **White + Plain**; pay **1 Coin**.", "zh-CN": "每次**陶车坊**行动后：将本次行动形成的 1 件器物施以**白釉 + 素面**；支付 **1 铜钱**。" },
      ST03: { en: "After each **Glaze & Decoration** action: pay **1 Wood** → load 1 ceramic glazed by that action.", "zh-CN": "每次**釉饰坊**行动后：支付 **1 柴** → 将本次行动施釉的 1 件陶瓷装窑。" },
      ST04: { en: "After each **Kiln Yard** action in which you load: gain **1 Clay or 1 Wood**.", "zh-CN": "每次**窑坊**行动中至少装窑 1 件后：获得 **1 泥或 1 柴**。" },
      T01: { en: "Once/round, **Potter’s Wheel**: if you form a Vase or Censer, total Clay cost **−1**.", "zh-CN": "每轮一次，**陶车坊**：若形成瓶或香炉，本次行动所需泥总数 **−1**。" },
      T02: { en: "Once/round, after forming: if you have another Shaped/Glazed vessel of a **different Shape**, gain **2 Coins**.", "zh-CN": "每轮一次，形成后：若你另有一件**不同器形**的成型／施釉器物，获得 **2 铜钱**。" },
      T03: { en: "Once/round, after forming: if you have another Shaped/Glazed vessel of the **same Shape**, gain **2 Coins**.", "zh-CN": "每轮一次，形成后：若你另有一件**相同器形**的成型／施釉器物，获得 **2 铜钱**。" },
      T04: { en: "Once/round, after **Potter’s Wheel**: give 1 vessel formed by that action **any Glaze + any Decoration**; pay its Decoration cost.", "zh-CN": "每轮一次，**陶车坊**行动后：将本次行动形成的 1 件器物施以**任意釉色 + 任意装饰**；支付该装饰费用。" },
      T05: { en: "Once/round, while glazing: change that vessel to **any other Shape**.", "zh-CN": "每轮一次，施釉时：将该器物改为**任意其他器形**。" },
      T06: { en: "Once/round, while glazing: change **1 other unloaded Glazed ceramic** to any Glaze.", "zh-CN": "每轮一次，施釉时：将另 1 件**未装窑的已施釉陶瓷**改为任意釉色。" },
      T07: { en: "Once/round: one **Carved** Decoration you apply costs **0 Coins**.", "zh-CN": "每轮一次：你施加的 1 个**刻花**装饰费用为 **0 铜钱**。" },
      T08: { en: "Once/round: one **Impressed** Decoration you apply costs **0 Coins**.", "zh-CN": "每轮一次：你施加的 1 个**印花**装饰费用为 **0 铜钱**。" },
      T09: { en: "Once/round: one **Crackle** Decoration you apply costs **0 Coins**.", "zh-CN": "每轮一次：你施加的 1 个**开片**装饰费用为 **0 铜钱**。" },
      T10: { en: "Once/round, when reserving: look at the **top 3 Orders**. Reserve 1 of them **or 1 face-up Order**; discard the other looked-at Orders.", "zh-CN": "每轮一次，承接委托时：查看主委托牌堆顶 **3 张**。承接其中 1 张**或 1 张明置委托**；弃掉其余查看过的委托。" },
      T11: { en: "Once/round, after Quality: pay **1 Wood** → improve 1 ceramic one level:\n**Flawed → Standard** or **Standard → Fine**. Cannot create Masterpiece.", "zh-CN": "每轮一次，判定品质后：支付 **1 柴** → 将 1 件陶瓷提升一级：\n**瑕品 → 良品** 或 **良品 → 上品**。不能提升为臻品。" },
      T12: { en: "When choosing **Bank or Stoke**, secretly pay **+1 Wood** → your Contribution becomes **−2 or +2**.", "zh-CN": "选择**压火或添柴**时，秘密额外支付 **1 柴** → 你的控火值变为 **−2 或 +2**。" },
      T13: { en: "Once/round, before Contributions: if you have a ceramic firing, pay **1 Wood** → privately view the top Fire card.", "zh-CN": "每轮一次，选择控火牌前：若你有陶瓷参与本次烧成，支付 **1 柴** → 私下查看牌堆顶的火牌。" },
      T14: { en: "Once/round, after Quality: choose 1 **Flawed or Standard** ceramic. Reveal another Fire card and recalculate its Heat & Quality. **The new result replaces the old, even if worse.**", "zh-CN": "每轮一次，判定品质后：选择 1 件**瑕品或良品**。额外翻开 1 张火牌并重新计算其火候与品质。**新结果取代旧结果，即使更差。**" },
      T15: { en: "Once/round, when loading into **High or Low**: place this tile beneath that ceramic. Its zone modifier is **0 this firing**, even if moved.", "zh-CN": "每轮一次，装入**高温区或低温区**时：将此牌置于该陶瓷下。本次烧成其窑位修正视为 **0**，即使之后被移动。" },
    });
  });

  it("wires compact copy into every face-up and owned hover/focus target", () => {
    for (const locale of ["en", "zh-CN"] as const) {
      const markups = (["P1", "P2", "P3", "P4"] as const).map((playerId) => tabletopMarkup(playerId, locale));
      const combinedText = markups.map(renderedText).join("\n");
      expect(markups[0]).toContain('data-hover-preview="advanced-technique"');
      expect(markups[0]).toContain('data-hover-preview="starting-technique"');
      for (const id of ALL_TECHNIQUE_IDS) {
        expect(combinedText, `${id} ${locale} preview`).toContain(techniqueShortPlainText(id, locale));
        expect(combinedText, `${id} ${locale} full`).not.toContain(techniqueFullCopy(id, locale));
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
        expect(preview, `${id} ${locale}`).not.toBe(full);
        expect(preview.length, `${id} ${locale}`).toBeLessThan(full.length);

        const previewMarkup = renderToStaticMarkup(createElement(KilnDescription, { id, locale, layer: "preview" }));
        const fullMarkup = renderToStaticMarkup(createElement(KilnDescription, { id, locale, layer: "full" }));
        expect(previewMarkup, `${id} ${locale} preview`).not.toContain("<strong>");
        expect(previewMarkup, `${id} ${locale} preview`).not.toContain("**");
        expect(fullMarkup, `${id} ${locale} full`).not.toBe(previewMarkup);
      }
    }
  });

  it("preserves the supplied compact English and Simplified Chinese wording", () => {
    expect(KILN_SHORT_COPY).toEqual({
      RU: { en: "**Once/round:** Complete an Order using a **Masterpiece · Celadon · Plain** ceramic → **+4 VP**.", "zh-CN": "**每轮一次：**\n完成委托时，若使用了 1 件**臻品 · 青釉 · 素面**陶瓷 → **+4 VP**。" },
      GU: { en: "**Once/round:** Complete a **Crown Order** → **+2 Coins +1 VP**.", "zh-CN": "**每轮一次：**\n完成 1 张**御令委托** → **+2 铜钱 +1 VP**。" },
      GE: { en: "**Once/round, before Quality:**\n1 ceramic at exactly **±1 Heat** → set it to **Preferred Heat** and change it to **Crackle** for free.", "zh-CN": "**每轮一次，判定品质前：**\n选择 1 件实际火候与适烧火候正好相差 **±1** 的陶瓷 → 将其实际火候设为**适烧火候**，并免费将装饰改为**开片**。" },
      DI: { en: "**Once/round, Potter’s Wheel:**\nAfter forming a **Bowl, Plate or Brush Washer**, pay **1 Clay** → form **+1 of the same Shape**.", "zh-CN": "**每轮一次，陶车坊：**\n形成**碗、盘或笔洗**后，支付 **1 泥** → 再形成 **1 件相同器形**。" },
      JU: { en: "**Once/round, before Quality:**\nPay **1 Wood** → adjust 1 ceramic’s **Actual Heat ±1**.", "zh-CN": "**每轮一次，判定品质前：**\n支付 **1 柴** → 将 1 件陶瓷的**实际火候 ±1**。" },
    });
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
        expect(tableText).not.toContain(kilnFullCopy(id, locale));
        renderedKilns.push(id);
      }
      expect(renderedKilns).toEqual(KILN_COPY_IDS);
    }
  });
});
