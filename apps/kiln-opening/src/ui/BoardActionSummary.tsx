import type { LocationId, WorkerKind } from "../game";
import type { Locale } from "./i18n";

const ACTION_SUMMARIES = {
  materials_yard: {
    apprentice: {
      en: "Gain 3 Clay / Wood in any mix",
      "zh-CN": "获得共3份泥／柴，任意组合",
    },
    shifu: {
      en: "Gain 4 Clay / Wood in any mix · pay 1 Coin → 1 Clay + 1 Wood",
      "zh-CN": "获得共4份泥／柴，任意组合 · 付1铜钱 → 1泥＋1柴",
    },
  },
  forming_studio: {
    apprentice: {
      en: "Form 1",
      "zh-CN": "成型1件",
    },
    shifu: {
      en: "Form up to 2 · −1 total Clay for two",
      "zh-CN": "成型至多2件 · 2件总费用−1泥",
    },
  },
  glaze_workshop: {
    apprentice: {
      en: "Glaze & decorate 1",
      "zh-CN": "为1件施釉与纹饰",
    },
    shifu: {
      en: "Glaze & decorate up to 2 · −1 total Coin for two",
      "zh-CN": "为至多2件施釉与纹饰 · 2件总费用−1铜钱",
    },
  },
  kiln_yard: {
    apprentice: {
      en: "Load 1",
      "zh-CN": "装窑1件",
    },
    shifu: {
      en: "Load up to 2 · mark 1 of yours in Shared Kiln · optional ±1 Heat later",
      "zh-CN": "装窑至多2件 · 标记1件己方共窑陶瓷 · 之后可±1火候",
    },
  },
  market_imperial_office: {
    apprentice: {
      en: "Reserve 1 Order · gain 1 Clay / Wood / Coin",
      "zh-CN": "承接1张委托 · 获得1泥／柴／铜钱",
    },
    shifu: {
      en: "Reserve up to 2 Orders · gain 1 Clay / Wood / Coin per Order",
      "zh-CN": "承接至多2张委托 · 每张获得1泥／柴／铜钱",
    },
  },
  guild_academy: {
    apprentice: {
      en: "Buy 1 face-up Tech · pay printed Coin cost",
      "zh-CN": "购买1个公开技艺 · 支付牌面铜钱费用",
    },
    shifu: {
      en: "Inspect 2 · buy 1 face-up or inspected Tech at −1 Coin",
      "zh-CN": "查看2个技艺 · 购买1个公开或刚查看的技艺，费用−1铜钱",
    },
  },
  labour: {
    apprentice: {
      en: "Gain 2 Coins",
      "zh-CN": "获得2铜钱",
    },
    shifu: {
      en: "Gain 4 Coins",
      "zh-CN": "获得4铜钱",
    },
  },
  court_patronage: {
    apprentice: {
      en: "Pay 4 Coins → Recognition +1",
      "zh-CN": "支付4铜钱 → 御府声望＋1",
    },
    shifu: {
      en: "Pay 4 Coins → Recognition +1",
      "zh-CN": "支付4铜钱 → 御府声望＋1",
    },
  },
} satisfies Record<LocationId, Record<WorkerKind, Record<Locale, string>>>;

/** Brief illustrated-board labels; full action rules belong in the detail view. */
export function BoardActionSummary({ id, kind, locale }: {
  id: LocationId;
  kind: WorkerKind;
  locale: Locale;
}) {
  return <span className="kiln-board-action-summary">{ACTION_SUMMARIES[id][kind][locale]}</span>;
}
