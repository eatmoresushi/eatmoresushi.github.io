import { describe, expect, it } from "vitest";
import { CATALOG } from "../../../../src/app/i18n/index.ts";
import { glossaryTableAfter, retiredTermsIn } from "../../support/glossary.ts";
import { allStrings } from "./catalog_support.ts";

/**
 * §6.4 `glossary_terms`: Chinese UI strings use the glossary's fixed terms (D6) and none of the
 * §1.5 banned or retired terms. The UI verbs and buttons follow glossary §2.16 exactly.
 */
const VERBS = glossaryTableAfter("### 2.16");
const verb = (english: string): string => {
  const row = VERBS.find(([en]) => en === english);
  if (row === undefined) throw new Error(`glossary §2.16 has no "${english}"`);
  return row[1] ?? "";
};

/** `common` key → glossary §2.16 English row. */
const VERB_KEYS: ReadonlyArray<readonly [keyof typeof CATALOG.common.zh, string]> = [
  ["verb.placeWorker", "Place worker"],
  ["verb.chooseLocation", "Choose a location"],
  ["verb.confirm", "Confirm"],
  ["verb.cancel", "Cancel"],
  ["verb.decline", "Decline (an optional ability)"],
  ["verb.skip", "Skip (an optional step; never the Work Phase)"],
  ["verb.endTurn", "End turn"],
  ["verb.done", "Done"],
  ["verb.form", "Form"],
  ["verb.decorate", "Decorate"],
  ["verb.glaze", "Glaze"],
  ["verb.load", "Load"],
  ["verb.loadImperial", "Load into Imperial Kiln"],
  ["verb.useImperialPriority", "Use Imperial Priority"],
  ["verb.reserve", "Reserve"],
  ["verb.blindReserve", "Blind reserve"],
  ["verb.completeOrder", "Complete Order"],
  ["verb.buy", "Buy (Tech)"],
  ["verb.gain", "Gain"],
  ["verb.pay", "Pay"],
  ["verb.discard", "Discard"],
  ["verb.rollKilnDie", "Roll Kiln Die"],
  ["verb.chooseContribution", "Choose Contribution (secret)"],
  ["verb.reveal", "Reveal"],
  ["verb.returnHeatMarker", "Return Heat marker"],
  ["verb.useAbility", "Use ability"],
  ["status.waitingFor", "Waiting for {name}…"],
  ["status.waitingForOthers", "Waiting for other workshops…"],
  ["status.yourTurn", "Your turn"],
  ["status.usedThisRound", "Used this round"],
  ["status.ready", "Ready"],
  ["status.onlyYou", "Private (only you can see)"],
  ["status.hiddenUntilAll", "Hidden until all submit"],
];

describe("Chinese UI terms follow the glossary", () => {
  it.each(VERB_KEYS)("common.%s is the glossary §2.16 term for “%s”", (key, english) => {
    expect(CATALOG.common.zh[key]).toBe(verb(english));
  });

  it("turns Heat markers with the glossary wording", () => {
    const [plus, minus] = verb("Turn Heat marker to +1 / −1").split("／");
    expect(CATALOG.common.zh["verb.turnHeatMarker"].replace("{value}", "+1")).toBe(plus);
    expect(CATALOG.common.zh["verb.turnHeatMarker"].replace("{value}", "−1")).toBe(minus);
  });

  it("uses no retired or banned term in any Chinese string (glossary §1.5, §6)", () => {
    const offences = allStrings()
      .filter((entry) => entry.locale === "zh")
      .flatMap((entry) => retiredTermsIn(entry.text).map((term) => `${entry.id}: ${term}`));
    expect(offences).toEqual([]);
  });

  it("uses 交货 only in the phase name 交货阶段", () => {
    const offences = allStrings().filter((entry) => entry.locale === "zh" && /交货(?!阶段)/.test(entry.text)).map((entry) => entry.id);
    expect(offences).toEqual([]);
  });

  it("writes VP as 分 and counts vessels with 件 in Chinese", () => {
    const offences = allStrings()
      .filter((entry) => entry.locale === "zh")
      .filter((entry) => /VP|胜利点|\{n\}坯|\d坯/.test(entry.text))
      .map((entry) => entry.id);
    expect(offences).toEqual([]);
  });
});
