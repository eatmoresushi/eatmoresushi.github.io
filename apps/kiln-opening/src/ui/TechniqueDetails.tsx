import type { Locale } from "./i18n";
import type { TechniqueCopyId } from "./TechniqueDescription";

interface LocalizedClarification {
  readonly en: string;
  readonly "zh-CN": string;
}

// The owner's full appendix is preserved verbatim in
// docs/KILN_OPENING_v1.2.7_TECH_DETAIL_TEXT_SOURCE.md. These are its relevant
// clarifications, shared where one paragraph applies to multiple Techs.
const whiteSlipAndDryingFrames: LocalizedClarification = {
  en: "White Slip and Drying Frames may both be used with the same Potter’s Wheel action, including an Apprentice action that forms an additional vessel through Ding’s Moulded Production. They must affect different vessels, and each vessel must meet the chosen effect’s requirements. Ding’s additional vessel is eligible for either effect.",
  "zh-CN": "白陶衣和晾坯架可在同一次陶车坊行动中使用，包括通过定窑的模制增产额外形成器物的学徒行动。两项技艺必须作用于不同器物，且各器物须满足所选效果的要求。定窑额外形成的器物可被任一效果选中。",
};

const ownCeramicsInThisFiring: LocalizedClarification = {
  en: "Protective Saggars and Second Firing affect only your own eligible ceramics in the current firing, whether in the Shared Kiln or your Imperial Kiln. They cannot target ceramics fired in earlier rounds.",
  "zh-CN": "匣钵护烧和复烧只能作用于你本次烧成中符合条件的陶瓷，无论其位于共窑还是你的御窑。不能选择在之前轮次已烧成的陶瓷。",
};

export const TECHNIQUE_CLARIFICATIONS = {
  ST02: [whiteSlipAndDryingFrames],
  T01: [{
    en: "Large Throwing Wheel stacks with the Shifu Potter’s Wheel discount.",
    "zh-CN": "大陶车可与师傅的陶车坊优惠叠加。",
  }],
  T04: [whiteSlipAndDryingFrames],
  T06: [{
    en: "Glaze Palette changes only the ceramic about to be loaded. It may be used when loading through a Kiln Yard action, Rapid Drying or Imperial Priority, into the Shared Kiln or your Imperial Kiln. It does not itself load a ceramic; the loading must still follow its normal costs and restrictions. It cannot change a ceramic that is already loaded or has been fired.",
    "zh-CN": "釉色谱只能改变即将装窑的陶瓷。通过窑坊行动、催干或御烧优先装入共窑或你的御窑时，均可使用。此技艺本身不会装窑；装窑仍须遵守正常费用和限制。不能改变已装窑或已烧成的陶瓷。",
  }],
  T10: [{
    en: "Colour Samples: The one-off reservation when acquired is separate from its once-per-round Commission Market effect and does not use that effect for the round. It grants no Commission Market resource bonus and is not a Commission Market action. During a Commission Market action, the ongoing effect replaces the choice for 1 reservation; it does not grant an extra reservation, and you still gain the normal 1 Clay, 1 Wood or 1 Coin for that reservation. A Shifu's other reservation follows the normal rules.",
    "zh-CN": "色样簿：获得时的一次性承接与其每轮一次的瓷牙行效果分别结算，不消耗本轮该效果的使用次数。这次承接不提供瓷牙行资源奖励，也不视为瓷牙行行动。在瓷牙行行动中，持续效果仅替代1次承接的选择，不额外增加承接次数；该次承接仍照常获得1泥、1柴或1铜钱。师傅的另一次承接遵循正常规则。",
  }],
  T11: [ownCeramicsInThisFiring],
  T13: [{
    en: "Test Pieces is private information; you may discuss what you saw but may not show the Fire card.",
    "zh-CN": "火照查看的内容属于秘密信息；你可以讨论所见内容，但不能展示窑火牌。",
  }],
  T14: [ownCeramicsInThisFiring, {
    en: "Second Firing affects only the chosen ceramic; its extra Fire card does not change Global Heat for any other ceramic. Any relevant once-per-round firing ability you have not yet used may resolve at its normal timing during the recalculation.",
    "zh-CN": "复烧只影响所选陶瓷；额外窑火牌不会改变其他陶瓷的全局火候。重新计算时，你尚未使用且适用的每轮一次烧成能力，均可在正常时机结算。",
  }],
} as const satisfies Partial<Record<TechniqueCopyId, readonly LocalizedClarification[]>>;

export function techniqueClarificationCopy(id: string, locale: Locale): readonly string[] {
  const clarifications = (TECHNIQUE_CLARIFICATIONS as Partial<Record<string, readonly LocalizedClarification[]>>)[id];
  return clarifications?.map((clarification) => clarification[locale]) ?? [];
}

export function TechniqueUseNote({ id, locale }: { id: string; locale: Locale }) {
  return <p className="kiln-tabletop-tech-use-note">{locale === "zh-CN"
    ? "除非明确要求，否则技艺能力均可选择使用。使用时须支付列出的费用。放弃使用不会消耗每轮使用次数。"
    : "Tech abilities are optional unless explicitly required. Pay any stated cost when using an ability. Declining does not spend a once-per-round use."}{id === "T10" && (locale === "zh-CN"
      ? "色样簿获得时的立即选择必须结算。"
      : " Colour Samples’ immediate selection when acquired is required.")}</p>;
}

/** Additional rules shown only in the clicked Tech's detailed inspection. */
export function TechniqueClarifications({ id, locale }: { id: string; locale: Locale }) {
  const clarifications = techniqueClarificationCopy(id, locale);
  if (clarifications.length === 0) return null;

  return (
    <section
      className="kiln-tabletop-inspector-section kiln-tabletop-tech-clarifications"
      data-technique-clarifications={id}
    >
      <h3>{locale === "zh-CN" ? "技艺说明" : "Clarifications"}</h3>
      {clarifications.map((clarification, index) => (
        <p className="kiln-tabletop-ability-copy" key={`${id}-${index}`}>{clarification}</p>
      ))}
    </section>
  );
}
